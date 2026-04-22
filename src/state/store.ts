import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  CurrencyCode,
  Expense,
  Group,
  SplitEntry,
  SplitMode,
} from '../types';
import { newId } from '../lib/id';
import type {
  ChatMessage,
  ContentBlock,
  ExpenseDraft,
  ModelId,
  ReasoningEffort,
  TokenUsage,
} from '../lib/llm/types';
import { dayKey, monthKey, usageToMicroUsd } from '../lib/llm/cost';
import { getModel } from '../lib/llm/models';
import { DEFAULT_POLICY, type Policy, type Provider } from '../lib/policy';
import { isAllowedLocalBaseUrl } from '../lib/llm/localClient';
import {
  DEFAULT_LIMITS,
  checkAndConsume,
  initialRateLimiterState,
  type ConsumeResult,
  type RateLimiterState,
  type RateLimits,
} from '../lib/rateLimiter';
import { isEncrypted } from '../lib/crypto';
import { keyVault, VaultLockedError, type VaultMeta } from '../lib/keyVault';
import { clearImageCache, forgetImage } from './imageCache';

export interface ExpenseInput {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  splitMode: SplitMode;
  split: SplitEntry[];
}

export interface LocalModelSettings {
  baseUrl: string;
  modelName: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  supportsVision: boolean;
}

export interface Settings {
  llmProvider: Provider;
  apiKeys: { anthropic?: string; openai?: string; local?: string };
  modelOverride: ModelId | null;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  rateLimiter: RateLimiterState;
  rateLimits: RateLimits;
  retryConfig: { maxRetries: number; baseDelayMs: number };
  vault: VaultMeta | null;
  localModel: LocalModelSettings;
}

export interface Conversation {
  messages: ChatMessage[];
  updatedAt: number;
  injectionBannerDismissed: boolean;
}

export interface CostTracker {
  dailyUsdMicros: Record<string, number>;
  monthlyUsdMicros: Record<string, number>;
  perMessage: Array<{
    messageId: string;
    usdMicros: number;
    tokens: TokenUsage;
    model: ModelId;
    at: number;
  }>;
}

export interface AppState {
  groups: Record<string, Group>;
  groupOrder: string[];
  activeGroupId: string | null;

  settings: Settings;
  conversations: Record<string, Conversation>;
  policy: Policy;
  costTracker: CostTracker;
  vaultUnlocked: boolean;

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

  setRateHint: (groupId: string, code: CurrencyCode, rate: number) => void;

  addExpense: (groupId: string, input: ExpenseInput) => string;
  updateExpense: (groupId: string, expenseId: string, input: ExpenseInput) => void;
  deleteExpense: (groupId: string, expenseId: string) => void;

  setLLMProvider: (provider: Provider) => void;
  setApiKey: (provider: Provider, key: string) => Promise<void>;
  clearApiKey: (provider: Provider) => void;
  setLocalModel: (settings: LocalModelSettings) => void;
  setupVault: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  lockVault: () => void;
  wipeVault: () => void;
  setModelOverride: (id: ModelId | null) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setPlanMode: (v: boolean) => void;
  setRetryConfig: (cfg: { maxRetries: number; baseDelayMs: number }) => void;
  setRateLimits: (limits: RateLimits) => void;
  consumeRateToken: (nowMs: number) => ConsumeResult;

  appendMessage: (groupId: string, msg: ChatMessage) => void;
  acceptDrafts: (groupId: string, messageId: string, draftIndexes: number[]) => string[];
  discardDrafts: (groupId: string, messageId: string) => void;
  clearConversation: (groupId: string) => void;
  dismissInjectionBanner: (groupId: string) => void;

  setAllowedProviders: (providers: Provider[]) => void;
  setDailyCap: (micros: number) => void;
  setMonthlyCap: (micros: number) => void;
  grantImageConsent: (provider: Provider) => void;
  setPersistHistory: (v: boolean) => void;
  resetPolicy: () => void;

  recordCost: (messageId: string, usage: TokenUsage, model: ModelId, nowMs: number) => number;

  resetAll: () => void;
  importState: (json: string) => void;
  exportState: () => string;
}

export function defaultLocalModel(): LocalModelSettings {
  return {
    baseUrl: '',
    modelName: '',
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_096,
    supportsVision: false,
  };
}

function defaultSettings(): Settings {
  return {
    llmProvider: 'openai',
    apiKeys: {},
    modelOverride: null,
    reasoningEffort: 'minimal',
    planMode: false,
    rateLimiter: initialRateLimiterState(DEFAULT_LIMITS, 0),
    rateLimits: DEFAULT_LIMITS,
    retryConfig: { maxRetries: 3, baseDelayMs: 500 },
    vault: null,
    localModel: defaultLocalModel(),
  };
}

function defaultCostTracker(): CostTracker {
  return { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] };
}

function emptyConversation(): Conversation {
  return { messages: [], updatedAt: 0, injectionBannerDismissed: false };
}

const EMPTY_CONVERSATION: Conversation = Object.freeze({
  messages: [] as ChatMessage[],
  updatedAt: 0,
  injectionBannerDismissed: false,
}) as Conversation;

const initialState = {
  groups: {} as Record<string, Group>,
  groupOrder: [] as string[],
  activeGroupId: null as string | null,
  settings: defaultSettings(),
  conversations: {} as Record<string, Conversation>,
  policy: DEFAULT_POLICY,
  costTracker: defaultCostTracker(),
  vaultUnlocked: false,
};

function memberReferenceCount(group: Group, memberId: string): number {
  return group.expenses.filter(
    (e) => e.payerId === memberId || e.split.some((s) => s.memberId === memberId),
  ).length;
}

function redactKeys(settings: Settings): Settings {
  return { ...settings, apiKeys: { anthropic: '', openai: '', local: '' } };
}

function collectImageIds(conversation: Conversation | undefined): string[] {
  if (!conversation) return [];
  const ids: string[] = [];
  for (const m of conversation.messages) {
    for (const b of m.blocks) {
      if (b.type === 'image') ids.push(m.id);
    }
  }
  return ids;
}

function strippedBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((b) => (b.type === 'image' ? { ...b, base64: '' } : b));
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
        const conv = get().conversations[groupId];
        const imageIds = collectImageIds(conv);
        for (const id of imageIds) forgetImage(id);
        const deletedMessageIds = new Set<string>(conv ? conv.messages.map((m) => m.id) : []);
        set((s) => {
          if (!s.groups[groupId]) return s;
          const { [groupId]: _g, ...rest } = s.groups;
          const { [groupId]: _c, ...restConversations } = s.conversations;
          const order = s.groupOrder.filter((id) => id !== groupId);
          const activeGroupId =
            s.activeGroupId === groupId ? order[0] ?? null : s.activeGroupId;
          const perMessage = deletedMessageIds.size
            ? s.costTracker.perMessage.filter((c) => !deletedMessageIds.has(c.messageId))
            : s.costTracker.perMessage;
          return {
            groups: rest,
            conversations: restConversations,
            groupOrder: order,
            activeGroupId,
            costTracker: { ...s.costTracker, perMessage },
          };
        });
      },

      setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

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
            [groupId]: { ...group, baseCurrency: newBase, expenses: updatedExpenses, rateHints: {} },
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
              members: group.members.map((m) => (m.id === memberId ? { ...m, name: trimmed } : m)),
            },
          },
        }));
      },

      setRateHint: (groupId, code, rate) => {
        if (!Number.isFinite(rate) || rate <= 0) {
          throw new Error(`Rate must be a positive number; got ${rate}.`);
        }
        const group = get().groups[groupId];
        if (!group) throw new Error(`Unknown groupId: ${groupId}`);
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, rateHints: { ...group.rateHints, [code]: rate } },
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

      setLLMProvider: (provider) =>
        set((s) => ({ settings: { ...s.settings, llmProvider: provider } })),

      setApiKey: async (provider, key) => {
        const trimmed = key.trim();
        if (trimmed === '') {
          set((s) => {
            const next = { ...s.settings.apiKeys };
            delete next[provider];
            return { settings: { ...s.settings, apiKeys: next } };
          });
          return;
        }
        const vault = get().settings.vault;
        let stored = trimmed;
        if (vault !== null) {
          if (!keyVault.isUnlocked()) {
            throw new VaultLockedError(
              'Unlock the passphrase vault in Settings → Security before saving a new key.',
            );
          }
          if (!isEncrypted(trimmed)) {
            stored = await keyVault.encryptKey(trimmed);
          }
        }
        set((s) => ({
          settings: { ...s.settings, apiKeys: { ...s.settings.apiKeys, [provider]: stored } },
        }));
      },

      clearApiKey: (provider) =>
        set((s) => {
          const next = { ...s.settings.apiKeys };
          delete next[provider];
          return { settings: { ...s.settings, apiKeys: next } };
        }),

      setupVault: async (passphrase) => {
        if (get().settings.vault !== null) {
          throw new Error('A passphrase is already configured. Wipe the vault to set a new one.');
        }
        const { meta } = await keyVault.setup(passphrase);
        const existing = get().settings.apiKeys;
        const reencrypted: Settings['apiKeys'] = {};
        for (const p of ['anthropic', 'openai', 'local'] as const) {
          const v = existing[p];
          if (!v || v.length === 0) continue;
          reencrypted[p] = isEncrypted(v) ? v : await keyVault.encryptKey(v);
        }
        set((s) => ({
          vaultUnlocked: true,
          settings: { ...s.settings, vault: meta, apiKeys: reencrypted },
        }));
      },

      setLocalModel: (settings) => {
        if (settings.baseUrl.length > 0 && !isAllowedLocalBaseUrl(settings.baseUrl)) {
          throw new Error(
            `Base URL "${settings.baseUrl}" is not allowed. Only HTTPS URLs or http://localhost, http://127.0.0.1, http://[::1] may be used.`,
          );
        }
        if (!Number.isFinite(settings.contextWindowTokens) || settings.contextWindowTokens < 1024) {
          throw new Error('Context window must be at least 1024 tokens.');
        }
        if (!Number.isFinite(settings.maxOutputTokens) || settings.maxOutputTokens < 256) {
          throw new Error('Max output tokens must be at least 256.');
        }
        set((s) => ({
          settings: { ...s.settings, localModel: { ...settings } },
        }));
      },

      unlockVault: async (passphrase) => {
        const meta = get().settings.vault;
        if (meta === null) {
          throw new Error('No passphrase is configured. Set one up first.');
        }
        await keyVault.unlock(passphrase, meta);
        set({ vaultUnlocked: true });
      },

      lockVault: () => {
        keyVault.lock();
        set({ vaultUnlocked: false });
      },

      wipeVault: () => {
        keyVault.wipe();
        set((s) => ({
          vaultUnlocked: false,
          settings: { ...s.settings, vault: null, apiKeys: {} as Settings['apiKeys'] },
        }));
      },

      setModelOverride: (id) =>
        set((s) => ({ settings: { ...s.settings, modelOverride: id } })),

      setReasoningEffort: (effort) =>
        set((s) => ({ settings: { ...s.settings, reasoningEffort: effort } })),

      setPlanMode: (v) => set((s) => ({ settings: { ...s.settings, planMode: v } })),

      setRetryConfig: (cfg) =>
        set((s) => ({ settings: { ...s.settings, retryConfig: cfg } })),

      setRateLimits: (limits) =>
        set((s) => ({
          settings: {
            ...s.settings,
            rateLimits: limits,
            rateLimiter: initialRateLimiterState(limits, 0),
          },
        })),

      consumeRateToken: (nowMs) => {
        const { settings } = get();
        const result = checkAndConsume(settings.rateLimiter, nowMs, settings.rateLimits);
        set((s) => ({
          settings: { ...s.settings, rateLimiter: result.next },
        }));
        return result;
      },

      appendMessage: (groupId, msg) => {
        set((s) => {
          const existing = s.conversations[groupId] ?? emptyConversation();
          const stripped: ChatMessage = { ...msg, blocks: strippedBlocks(msg.blocks) };
          return {
            conversations: {
              ...s.conversations,
              [groupId]: {
                ...existing,
                messages: [...existing.messages, stripped],
                updatedAt: msg.createdAt,
              },
            },
          };
        });
      },

      acceptDrafts: (groupId, messageId, draftIndexes) => {
        const s = get();
        const conv = s.conversations[groupId];
        const group = s.groups[groupId];
        if (!conv || !group) return [];
        const msg = conv.messages.find((m) => m.id === messageId);
        if (!msg || !msg.drafts) return [];
        const ids: string[] = [];
        for (const i of draftIndexes) {
          const d = msg.drafts[i];
          if (!d) continue;
          const id = get().addExpense(groupId, draftToExpenseInput(d));
          ids.push(id);
        }
        return ids;
      },

      discardDrafts: (groupId, messageId) => {
        set((s) => {
          const conv = s.conversations[groupId];
          if (!conv) return s;
          return {
            conversations: {
              ...s.conversations,
              [groupId]: {
                ...conv,
                messages: conv.messages.map((m) =>
                  m.id === messageId ? { ...m, drafts: [] } : m,
                ),
              },
            },
          };
        });
      },

      clearConversation: (groupId) => {
        const ids = collectImageIds(get().conversations[groupId]);
        for (const id of ids) forgetImage(id);
        set((s) => {
          if (!s.conversations[groupId]) return s;
          return {
            conversations: {
              ...s.conversations,
              [groupId]: emptyConversation(),
            },
          };
        });
      },

      dismissInjectionBanner: (groupId) => {
        set((s) => {
          const conv = s.conversations[groupId] ?? emptyConversation();
          return {
            conversations: {
              ...s.conversations,
              [groupId]: { ...conv, injectionBannerDismissed: true },
            },
          };
        });
      },

      setAllowedProviders: (providers) =>
        set((s) => ({ policy: { ...s.policy, allowedProviders: providers } })),

      setDailyCap: (micros) =>
        set((s) => ({ policy: { ...s.policy, dailyCapUsdMicros: Math.max(0, Math.floor(micros)) } })),

      setMonthlyCap: (micros) =>
        set((s) => ({ policy: { ...s.policy, monthlyCapUsdMicros: Math.max(0, Math.floor(micros)) } })),

      grantImageConsent: (provider) =>
        set((s) => ({
          policy: {
            ...s.policy,
            imageConsentByProvider: { ...s.policy.imageConsentByProvider, [provider]: true },
          },
        })),

      setPersistHistory: (v) => set((s) => ({ policy: { ...s.policy, persistHistory: v } })),

      resetPolicy: () => set({ policy: DEFAULT_POLICY }),

      recordCost: (messageId, usage, model, nowMs) => {
        const micros = usageToMicroUsd(usage, getModel(model));
        const dk = dayKey(nowMs);
        const mk = monthKey(nowMs);
        set((s) => ({
          costTracker: {
            dailyUsdMicros: { ...s.costTracker.dailyUsdMicros, [dk]: (s.costTracker.dailyUsdMicros[dk] ?? 0) + micros },
            monthlyUsdMicros: { ...s.costTracker.monthlyUsdMicros, [mk]: (s.costTracker.monthlyUsdMicros[mk] ?? 0) + micros },
            perMessage: [
              ...s.costTracker.perMessage,
              { messageId, usdMicros: micros, tokens: usage, model, at: nowMs },
            ],
          },
        }));
        return micros;
      },

      resetAll: () => {
        clearImageCache();
        keyVault.wipe();
        set({
          groups: {},
          groupOrder: [],
          activeGroupId: null,
          conversations: {},
          costTracker: defaultCostTracker(),
          policy: DEFAULT_POLICY,
          settings: defaultSettings(),
          vaultUnlocked: false,
        });
      },

      importState: (json) => {
        const parsed = JSON.parse(json) as Partial<AppState>;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid state file.');
        }
        set((s) => ({
          groups: parsed.groups ?? {},
          groupOrder: parsed.groupOrder ?? [],
          activeGroupId: parsed.activeGroupId ?? null,
          conversations: parsed.conversations ?? {},
          policy: parsed.policy ?? s.policy,
          costTracker: parsed.costTracker ?? s.costTracker,
          settings: parsed.settings ? { ...s.settings, ...redactKeys(parsed.settings as Settings) } : s.settings,
        }));
      },

      exportState: () => {
        const { groups, groupOrder, activeGroupId, conversations, policy, costTracker, settings } = get();
        return JSON.stringify(
          {
            groups,
            groupOrder,
            activeGroupId,
            conversations,
            policy,
            costTracker,
            settings: redactKeys(settings),
          },
          null,
          2,
        );
      },
    }),
    {
      name: 'twc-v1',
      version: 8,
      partialize: (s) => ({
        groups: s.groups,
        groupOrder: s.groupOrder,
        activeGroupId: s.activeGroupId,
        settings: s.settings,
        conversations: s.policy.persistHistory ? s.conversations : {},
        policy: s.policy,
        costTracker: s.costTracker,
      }),
      migrate: (persisted, fromVersion) => {
        const base = persisted as Partial<AppState> | null;
        if (!base) return { ...initialState };
        const withV2 = (state: Partial<AppState>): Partial<AppState> => {
          const settings = state.settings as Settings | undefined;
          const provider = settings?.llmProvider;
          if (provider === 'anthropic' || provider === 'openai') return state;
          return {
            ...state,
            settings: {
              ...(settings ?? defaultSettings()),
              llmProvider: 'openai',
            } as Settings,
          };
        };
        const withV4 = (state: Partial<AppState>): Partial<AppState> => {
          const settings = state.settings as Partial<Settings> | undefined;
          if (settings && typeof settings.reasoningEffort === 'string') return state;
          return {
            ...state,
            settings: {
              ...defaultSettings(),
              ...(settings ?? {}),
              reasoningEffort: 'minimal',
            } as Settings,
          };
        };
        const withV5 = (state: Partial<AppState>): Partial<AppState> => {
          const settings = state.settings as Partial<Settings> | undefined;
          if (settings && typeof settings.planMode === 'boolean') return state;
          return {
            ...state,
            settings: {
              ...defaultSettings(),
              ...(settings ?? {}),
              planMode: false,
            } as Settings,
          };
        };
        const withV7 = (state: Partial<AppState>): Partial<AppState> => {
          const settings = state.settings as Partial<Settings> | undefined;
          if (settings && 'vault' in settings) return state;
          return {
            ...state,
            settings: {
              ...defaultSettings(),
              ...(settings ?? {}),
              vault: null,
            } as Settings,
          };
        };
        const withV8 = (state: Partial<AppState>): Partial<AppState> => {
          const settings = state.settings as Partial<Settings> | undefined;
          const policy = state.policy as Partial<Policy> | undefined;
          const policyUpdate =
            policy && policy.imageConsentByProvider && 'local' in policy.imageConsentByProvider
              ? policy
              : {
                  ...DEFAULT_POLICY,
                  ...(policy ?? {}),
                  imageConsentByProvider: {
                    anthropic: policy?.imageConsentByProvider?.anthropic ?? false,
                    openai: policy?.imageConsentByProvider?.openai ?? false,
                    local: false,
                  },
                };
          if (settings && 'localModel' in settings) {
            return { ...state, policy: policyUpdate as Policy };
          }
          return {
            ...state,
            policy: policyUpdate as Policy,
            settings: {
              ...defaultSettings(),
              ...(settings ?? {}),
              localModel: defaultLocalModel(),
            } as Settings,
          };
        };
        // v6 adds optional elapsedMs / sentInPlanMode on ChatMessage — additive, no transform.
        // v7 adds settings.vault = null (passphrase vault meta) — additive.
        // v8 adds settings.localModel + policy.imageConsentByProvider.local — additive.
        if (fromVersion >= 8) return base as AppState;
        if (fromVersion >= 7) return withV8(base) as AppState;
        if (fromVersion >= 6) return withV8(withV7(base)) as AppState;
        if (fromVersion >= 5) return withV8(withV7(base)) as AppState;
        if (fromVersion >= 4) return withV8(withV7(withV5(base))) as AppState;
        if (fromVersion >= 3) return withV8(withV7(withV5(withV4(base)))) as AppState;
        if (fromVersion >= 2) return withV8(withV7(withV5(withV4(withV2(base))))) as AppState;
        return withV8(
          withV7(
            withV5(
              withV4(
                withV2({
                  ...base,
                  groups: base.groups ?? {},
                  groupOrder: base.groupOrder ?? [],
                  activeGroupId: base.activeGroupId ?? null,
                  settings: defaultSettings(),
                  conversations: {},
                  policy: DEFAULT_POLICY,
                  costTracker: defaultCostTracker(),
                }),
              ),
            ),
          ),
        ) as AppState;
      },
    },
  ),
);

function draftToExpenseInput(d: ExpenseDraft): ExpenseInput {
  return {
    description: d.description,
    amountMinor: d.amountMinor,
    currency: d.currency,
    rateToBase: d.rateToBase,
    payerId: d.payerId,
    splitMode: d.splitMode,
    split: d.split,
  };
}

export function useActiveGroup(): Group | null {
  return useAppStore((s) => (s.activeGroupId ? s.groups[s.activeGroupId] ?? null : null));
}

export function useActiveConversation(groupId: string | null): Conversation {
  return useAppStore(
    useShallow((s) =>
      groupId && s.conversations[groupId] ? s.conversations[groupId] : EMPTY_CONVERSATION,
    ),
  );
}

export function useSettings(): Settings {
  return useAppStore(useShallow((s) => s.settings));
}

export function useVaultUnlocked(): boolean {
  return useAppStore((s) => s.vaultUnlocked);
}

export function usePolicy(): Policy {
  return useAppStore(useShallow((s) => s.policy));
}

export function useCostTracker(): CostTracker {
  return useAppStore(useShallow((s) => s.costTracker));
}

export function useCostTodayMicros(nowMs: number): number {
  const k = dayKey(nowMs);
  return useAppStore((s) => s.costTracker.dailyUsdMicros[k] ?? 0);
}
