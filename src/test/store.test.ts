import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../state/store';

function reset() {
  useAppStore.getState().resetAll();
  // Persist middleware writes to jsdom localStorage; clear it to avoid cross-test bleed.
  localStorage.clear();
}

describe('store groups + members', () => {
  beforeEach(reset);

  it('creates a group and makes it active by default', () => {
    const id = useAppStore.getState().createGroup('Tokyo Trip', 'JPY');
    const s = useAppStore.getState();
    expect(s.groupOrder).toEqual([id]);
    expect(s.activeGroupId).toBe(id);
    expect(s.groups[id].baseCurrency).toBe('JPY');
    expect(s.groups[id].name).toBe('Tokyo Trip');
  });

  it('adds members and rejects empty names', () => {
    const gid = useAppStore.getState().createGroup('G', 'USD');
    const mid = useAppStore.getState().addMember(gid, 'Alice');
    expect(useAppStore.getState().groups[gid].members).toHaveLength(1);
    expect(() => useAppStore.getState().addMember(gid, '  ')).toThrow();
    expect(mid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('blocks deleting a member who is referenced in an expense', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    const b = s.addMember(gid, 'Bob');
    s.addExpense(gid, {
      description: 'Dinner',
      amountMinor: 1000,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [
        { memberId: a, value: 1 },
        { memberId: b, value: 1 },
      ],
    });
    expect(() => useAppStore.getState().deleteMember(gid, a)).toThrow(/referenced/);
  });

  it('allows deleting an unreferenced member', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    s.deleteMember(gid, a);
    expect(useAppStore.getState().groups[gid].members).toHaveLength(0);
  });
});

describe('store expenses', () => {
  beforeEach(reset);

  it('updates rateHints when a non-base-currency expense is added', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'Coffee',
      amountMinor: 500,
      currency: 'USD',
      rateToBase: 150,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(useAppStore.getState().groups[gid].rateHints.USD).toBe(150);
  });

  it('updates and deletes expenses', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    const eid = s.addExpense(gid, {
      description: 'X',
      amountMinor: 100,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    s.updateExpense(gid, eid, {
      description: 'Y',
      amountMinor: 200,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(useAppStore.getState().groups[gid].expenses[0].description).toBe('Y');
    expect(useAppStore.getState().groups[gid].expenses[0].amountMinor).toBe(200);
    s.deleteExpense(gid, eid);
    expect(useAppStore.getState().groups[gid].expenses).toHaveLength(0);
  });
});

describe('store changeBaseCurrency', () => {
  beforeEach(reset);

  it('rewrites rateToBase for every expense and accepts user-supplied rates', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'yen item',
      amountMinor: 1000,
      currency: 'JPY',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    s.addExpense(gid, {
      description: 'usd item',
      amountMinor: 100,
      currency: 'USD',
      rateToBase: 150,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    // Switch base to USD. JPY needs a new rate; USD becomes 1.
    s.changeBaseCurrency(gid, 'USD', { JPY: 0.0066 });
    const g = useAppStore.getState().groups[gid];
    expect(g.baseCurrency).toBe('USD');
    expect(g.expenses[0].rateToBase).toBe(0.0066);
    expect(g.expenses[1].rateToBase).toBe(1);
  });

  it('throws when a needed rate is missing', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'x',
      amountMinor: 1000,
      currency: 'JPY',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(() => useAppStore.getState().changeBaseCurrency(gid, 'USD', {})).toThrow();
  });
});
