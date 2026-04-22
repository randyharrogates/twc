import { describe, expect, it } from 'vitest';
import type { Expense } from '../types';
import { sumMinor } from '../lib/money';
import { computeShares } from '../lib/splits';

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'e1',
    description: 'Test',
    amountMinor: 1000,
    currency: 'USD',
    rateToBase: 1,
    payerId: 'alice',
    splitMode: 'even',
    split: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('computeShares (even)', () => {
  it('splits evenly among participants with remainder to first', () => {
    const shares = computeShares(makeExpense({
      splitMode: 'even',
      amountMinor: 1000,
      split: [
        { memberId: 'alice', value: 1 },
        { memberId: 'bob', value: 1 },
        { memberId: 'charlie', value: 1 },
      ],
    }));
    expect(sumMinor([...shares.values()])).toBe(1000);
    expect(shares.get('alice')).toBe(334);
    expect(shares.get('bob')).toBe(333);
    expect(shares.get('charlie')).toBe(333);
  });

  it('assigns zero to non-participants and Σ still matches total', () => {
    const shares = computeShares(makeExpense({
      splitMode: 'even',
      amountMinor: 6000,
      currency: 'JPY',
      split: [
        { memberId: 'alice', value: 1 },
        { memberId: 'bob', value: 1 },
        { memberId: 'charlie', value: 0 },
      ],
    }));
    expect(sumMinor([...shares.values()])).toBe(6000);
    expect(shares.get('charlie')).toBe(0);
    expect(shares.get('alice')).toBe(3000);
    expect(shares.get('bob')).toBe(3000);
  });
});

describe('computeShares (shares)', () => {
  it('distributes 2:1 across members and preserves the total', () => {
    const shares = computeShares(makeExpense({
      splitMode: 'shares',
      amountMinor: 1000,
      currency: 'JPY',
      split: [
        { memberId: 'alice', value: 2 },
        { memberId: 'bob', value: 1 },
        { memberId: 'charlie', value: 0 },
      ],
    }));
    expect(sumMinor([...shares.values()])).toBe(1000);
    expect(shares.get('alice')).toBe(667);
    expect(shares.get('bob')).toBe(333);
    expect(shares.get('charlie')).toBe(0);
  });
});

describe('computeShares (exact)', () => {
  it('returns the entered exact amounts unchanged', () => {
    const shares = computeShares(makeExpense({
      splitMode: 'exact',
      amountMinor: 1000,
      split: [
        { memberId: 'alice', value: 300 },
        { memberId: 'bob', value: 400 },
        { memberId: 'charlie', value: 300 },
      ],
    }));
    expect(shares.get('alice')).toBe(300);
    expect(shares.get('bob')).toBe(400);
    expect(shares.get('charlie')).toBe(300);
    expect(sumMinor([...shares.values()])).toBe(1000);
  });
});

describe('computeShares (percent)', () => {
  it('distributes percentages over minor units preserving the total', () => {
    const shares = computeShares(makeExpense({
      splitMode: 'percent',
      amountMinor: 1000,
      split: [
        { memberId: 'alice', value: 33 },
        { memberId: 'bob', value: 33 },
        { memberId: 'charlie', value: 34 },
      ],
    }));
    expect(sumMinor([...shares.values()])).toBe(1000);
    expect(shares.get('charlie')).toBe(340);
    expect(shares.get('alice')! + shares.get('bob')!).toBe(660);
  });
});
