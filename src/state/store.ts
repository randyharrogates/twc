import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CurrencyCode,
  Expense,
  Group,
  SplitEntry,
  SplitMode,
} from '../types';
import { newId } from '../lib/id';

export interface ExpenseInput {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  splitMode: SplitMode;
  split: SplitEntry[];
}

export interface AppState {
  groups: Record<string, Group>;
  groupOrder: string[];
  activeGroupId: string | null;

  createGroup: (name: string, baseCurrency: CurrencyCode) => string;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string | null) => void;
  changeBaseCurrency: (
    groupId: string,
    newBase: CurrencyCode,
    newRates: Partial<Record<CurrencyCode, number>>,
  ) => void;

  addMember: (groupId: string, name: string) => string;
  renameMember: (groupId: string, memberId: string, name: string) => void;
  deleteMember: (groupId: string, memberId: string) => void;

  addExpense: (groupId: string, input: ExpenseInput) => string;
  updateExpense: (groupId: string, expenseId: string, input: ExpenseInput) => void;
  deleteExpense: (groupId: string, expenseId: string) => void;

  resetAll: () => void;
  importState: (json: string) => void;
  exportState: () => string;
}

const initialState = {
  groups: {} as Record<string, Group>,
  groupOrder: [] as string[],
  activeGroupId: null as string | null,
};

function memberReferenceCount(group: Group, memberId: string): number {
  return group.expenses.filter(
    (e) => e.payerId === memberId || e.split.some((s) => s.memberId === memberId),
  ).length;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      createGroup: (name, baseCurrency) => {
        const id = newId();
        const group: Group = {
          id,
          name: name.trim() || 'Untitled Group',
          baseCurrency,
          createdAt: Date.now(),
          members: [],
          expenses: [],
          rateHints: {},
        };
        set((s) => ({
          groups: { ...s.groups, [id]: group },
          groupOrder: [...s.groupOrder, id],
          activeGroupId: s.activeGroupId ?? id,
        }));
        return id;
      },

      renameGroup: (groupId, name) => {
        const group = get().groups[groupId];
        if (!group) return;
        set((s) => ({
          groups: { ...s.groups, [groupId]: { ...group, name: name.trim() || group.name } },
        }));
      },

      deleteGroup: (groupId) => {
        set((s) => {
          if (!s.groups[groupId]) return s;
          const { [groupId]: _removed, ...rest } = s.groups;
          const order = s.groupOrder.filter((id) => id !== groupId);
          const activeGroupId =
            s.activeGroupId === groupId ? order[0] ?? null : s.activeGroupId;
          return { groups: rest, groupOrder: order, activeGroupId };
        });
      },

      setActiveGroup: (groupId) => {
        set({ activeGroupId: groupId });
      },

      changeBaseCurrency: (groupId, newBase, newRates) => {
        const group = get().groups[groupId];
        if (!group) return;
        const updatedExpenses = group.expenses.map((exp) => {
          if (exp.currency === newBase) return { ...exp, rateToBase: 1 };
          const rate = newRates[exp.currency];
          if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
            throw new Error(`Missing or invalid rate for ${exp.currency} → ${newBase}.`);
          }
          return { ...exp, rateToBase: rate };
        });
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: {
              ...group,
              baseCurrency: newBase,
              expenses: updatedExpenses,
              rateHints: {},
            },
          },
        }));
      },

      addMember: (groupId, name) => {
        const id = newId();
        const group = get().groups[groupId];
        if (!group) return id;
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Member name cannot be empty.');
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, members: [...group.members, { id, name: trimmed }] },
          },
        }));
        return id;
      },

      renameMember: (groupId, memberId, name) => {
        const group = get().groups[groupId];
        if (!group) return;
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Member name cannot be empty.');
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: {
              ...group,
              members: group.members.map((m) =>
                m.id === memberId ? { ...m, name: trimmed } : m,
              ),
            },
          },
        }));
      },

      deleteMember: (groupId, memberId) => {
        const group = get().groups[groupId];
        if (!group) return;
        const refCount = memberReferenceCount(group, memberId);
        if (refCount > 0) {
          const name = group.members.find((m) => m.id === memberId)?.name ?? 'Member';
          throw new Error(
            `${name} is referenced in ${refCount} expense${refCount === 1 ? '' : 's'} and cannot be deleted.`,
          );
        }
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, members: group.members.filter((m) => m.id !== memberId) },
          },
        }));
      },

      addExpense: (groupId, input) => {
        const id = newId();
        const group = get().groups[groupId];
        if (!group) return id;
        const expense: Expense = { id, createdAt: Date.now(), ...input };
        const rateHints =
          input.currency !== group.baseCurrency
            ? { ...group.rateHints, [input.currency]: input.rateToBase }
            : group.rateHints;
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, expenses: [...group.expenses, expense], rateHints },
          },
        }));
        return id;
      },

      updateExpense: (groupId, expenseId, input) => {
        const group = get().groups[groupId];
        if (!group) return;
        const existing = group.expenses.find((e) => e.id === expenseId);
        if (!existing) return;
        const updated: Expense = { ...existing, ...input };
        const rateHints =
          input.currency !== group.baseCurrency
            ? { ...group.rateHints, [input.currency]: input.rateToBase }
            : group.rateHints;
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: {
              ...group,
              expenses: group.expenses.map((e) => (e.id === expenseId ? updated : e)),
              rateHints,
            },
          },
        }));
      },

      deleteExpense: (groupId, expenseId) => {
        const group = get().groups[groupId];
        if (!group) return;
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, expenses: group.expenses.filter((e) => e.id !== expenseId) },
          },
        }));
      },

      resetAll: () => {
        set(initialState);
      },

      importState: (json) => {
        const parsed = JSON.parse(json) as Pick<
          AppState,
          'groups' | 'groupOrder' | 'activeGroupId'
        >;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid state file.');
        }
        set({
          groups: parsed.groups ?? {},
          groupOrder: parsed.groupOrder ?? [],
          activeGroupId: parsed.activeGroupId ?? null,
        });
      },

      exportState: () => {
        const { groups, groupOrder, activeGroupId } = get();
        return JSON.stringify({ groups, groupOrder, activeGroupId }, null, 2);
      },
    }),
    {
      name: 'twc-v1',
      version: 1,
      partialize: (s) => ({
        groups: s.groups,
        groupOrder: s.groupOrder,
        activeGroupId: s.activeGroupId,
      }),
    },
  ),
);

export function useActiveGroup(): Group | null {
  return useAppStore((s) => (s.activeGroupId ? s.groups[s.activeGroupId] ?? null : null));
}
