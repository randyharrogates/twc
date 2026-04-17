import { describe, expect, it } from 'vitest';
import type { Expense, Group } from '../types';
import { computeBalances, settle } from '../lib/settlement';
import { sumMinor } from '../lib/money';

function makeGroup(overrides: Partial<Group>): Group {
  return {
    id: 'g1',
    name: 'Test',
    baseCurrency: 'JPY',
    createdAt: 0,
    members: [],
    expenses: [],
    rateHints: {},
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'e',
    description: '',
    amountMinor: 0,
    currency: 'JPY',
    rateToBase: 1,
    payerId: '',
    splitMode: 'even',
    split: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('computeBalances + settle', () => {
  it('produces Bob→Alice and Charlie→Alice for a simple even split', () => {
    const group = makeGroup({
      members: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
        { id: 'charlie', name: 'Charlie' },
      ],
      expenses: [
        makeExpense({
          amountMinor: 6000,
          currency: 'JPY',
          payerId: 'alice',
          splitMode: 'even',
          split: [
            { memberId: 'alice', value: 1 },
            { memberId: 'bob', value: 1 },
            { memberId: 'charlie', value: 1 },
          ],
        }),
      ],
    });
    const balances = computeBalances(group);
    expect(sumMinor([...balances.values()])).toBe(0);
    const transfers = settle(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers).toContainEqual({ from: 'bob', to: 'alice', amountMinor: 2000 });
    expect(transfers).toContainEqual({ from: 'charlie', to: 'alice', amountMinor: 2000 });
  });

  it('handles payer not in the split', () => {
    // Alice pays ¥800 for Bob and Charlie only (Alice doesn't eat).
    const group = makeGroup({
      members: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
        { id: 'charlie', name: 'Charlie' },
      ],
      expenses: [
        makeExpense({
          amountMinor: 800,
          payerId: 'alice',
          splitMode: 'even',
          split: [
            { memberId: 'alice', value: 0 },
            { memberId: 'bob', value: 1 },
            { memberId: 'charlie', value: 1 },
          ],
        }),
      ],
    });
    const balances = computeBalances(group);
    expect(sumMinor([...balances.values()])).toBe(0);
    expect(balances.get('alice')).toBe(800);
    expect(balances.get('bob')).toBe(-400);
    expect(balances.get('charlie')).toBe(-400);
  });

  it('supports mixed-currency expenses and settles in the group base currency', () => {
    // Base JPY. Bob pays $30 at 1 USD = 150 JPY → ¥4500, even split across 3.
    const group = makeGroup({
      baseCurrency: 'JPY',
      members: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
        { id: 'charlie', name: 'Charlie' },
      ],
      expenses: [
        makeExpense({
          amountMinor: 3000,
          currency: 'USD',
          rateToBase: 150,
          payerId: 'bob',
          splitMode: 'even',
          split: [
            { memberId: 'alice', value: 1 },
            { memberId: 'bob', value: 1 },
            { memberId: 'charlie', value: 1 },
          ],
        }),
      ],
    });
    const balances = computeBalances(group);
    expect(sumMinor([...balances.values()])).toBe(0);
    expect(balances.get('bob')).toBe(3000);
    expect(balances.get('alice')).toBe(-1500);
    expect(balances.get('charlie')).toBe(-1500);
  });

  it('collapses chains to the minimum number of transfers', () => {
    // Alice is +300, Bob is -100, Charlie is -200. Two transfers: B→A 100, C→A 200.
    const balances = new Map<string, number>([
      ['alice', 300],
      ['bob', -100],
      ['charlie', -200],
    ]);
    const transfers = settle(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers).toContainEqual({ from: 'charlie', to: 'alice', amountMinor: 200 });
    expect(transfers).toContainEqual({ from: 'bob', to: 'alice', amountMinor: 100 });
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => settle(new Map([['a', 100], ['b', -50]]))).toThrow(/sum to 0/);
  });

  it('throws when the payer is not a group member', () => {
    const group = makeGroup({
      members: [{ id: 'alice', name: 'Alice' }],
      expenses: [
        makeExpense({
          amountMinor: 1000,
          payerId: 'ghost',
          splitMode: 'even',
          split: [{ memberId: 'alice', value: 1 }],
        }),
      ],
    });
    expect(() => computeBalances(group)).toThrow(/not a group member/);
  });

  it('Σ balances === 0 for a 0-decimal currency (KRW) with FX', () => {
    // Base KRW. Alice pays €10.00 at 1 EUR = 1500 KRW → ₩15000, even split across 3.
    const group = makeGroup({
      baseCurrency: 'KRW',
      members: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
        { id: 'charlie', name: 'Charlie' },
      ],
      expenses: [
        makeExpense({
          amountMinor: 1000,
          currency: 'EUR',
          rateToBase: 1500,
          payerId: 'alice',
          splitMode: 'even',
          split: [
            { memberId: 'alice', value: 1 },
            { memberId: 'bob', value: 1 },
            { memberId: 'charlie', value: 1 },
          ],
        }),
      ],
    });
    const balances = computeBalances(group);
    expect(sumMinor([...balances.values()])).toBe(0);
    // Alice's EUR native share is the largest (334 cents vs 333 each) so her
    // base-currency share is proportionally larger (5010 vs 4995 each).
    // Alice: paid ₩15000 − share ₩5010 = ₩9990.
    expect(balances.get('alice')).toBe(9990);
    expect(balances.get('bob')).toBe(-4995);
    expect(balances.get('charlie')).toBe(-4995);
  });
});
