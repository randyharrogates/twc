import { describe, expect, it } from 'vitest';
import type { Expense, Group, Transfer } from '../types';
import { formatSettlementSummary } from '../lib/summary';

function makeGroup(overrides: Partial<Group>): Group {
  return {
    id: 'g1',
    name: 'Test Group',
    baseCurrency: 'SGD',
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
    currency: 'SGD',
    rateToBase: 1,
    payerId: '',
    splitMode: 'even',
    split: [],
    createdAt: Date.parse('2026-03-15T09:00:00Z'),
    ...overrides,
  };
}

describe('formatSettlementSummary', () => {
  it('renders group header, expense list, balances, and transfers in SGD', () => {
    const group = makeGroup({
      name: 'Chalet 2026',
      baseCurrency: 'SGD',
      members: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
      expenses: [
        makeExpense({
          id: 'e1',
          description: 'Dinner',
          amountMinor: 6000,
          currency: 'SGD',
          payerId: 'alice',
          createdAt: Date.parse('2026-03-15T09:00:00Z'),
        }),
        makeExpense({
          id: 'e2',
          description: 'Groceries',
          amountMinor: 4000,
          currency: 'SGD',
          payerId: 'bob',
          createdAt: Date.parse('2026-03-16T12:00:00Z'),
        }),
      ],
    });
    const balances = new Map<string, number>([
      ['alice', 1000],
      ['bob', -1000],
    ]);
    const transfers: Transfer[] = [
      { from: 'bob', to: 'alice', amountMinor: 1000 },
    ];
    const out = formatSettlementSummary(group, balances, transfers);

    expect(out).toContain('Chalet 2026');
    expect(out).toContain('Base currency: SGD (Singapore Dollar)');
    expect(out).toContain('2026-03-15');
    expect(out).toContain('Alice · Dinner — S$60.00');
    expect(out).toContain('2026-03-16');
    expect(out).toContain('Bob · Groceries — S$40.00');
    expect(out).toContain('Alice: +S$10.00');
    expect(out).toContain('Bob: -S$10.00');
    expect(out).toContain('Bob → Alice: S$10.00');
  });

  it('handles a zero-expense group with "All settled." and an empty expense list', () => {
    const group = makeGroup({
      name: 'Empty',
      baseCurrency: 'USD',
      members: [{ id: 'a', name: 'Alice' }],
    });
    const out = formatSettlementSummary(group, new Map([['a', 0]]), []);
    expect(out).toContain('Expenses (0)');
    expect(out).toContain('(none)');
    expect(out).toContain('All settled.');
    expect(out).toContain('Alice: $0.00');
  });

  it('handles single-member groups', () => {
    const group = makeGroup({
      name: 'Solo',
      baseCurrency: 'USD',
      members: [{ id: 'a', name: 'Alice' }],
      expenses: [
        makeExpense({
          description: 'Self-treat',
          amountMinor: 500,
          currency: 'USD',
          payerId: 'a',
          splitMode: 'even',
          split: [{ memberId: 'a', value: 1 }],
        }),
      ],
    });
    const out = formatSettlementSummary(group, new Map([['a', 0]]), []);
    expect(out).toContain('Solo');
    expect(out).toContain('Alice · Self-treat — $5.00');
    expect(out).toContain('All settled.');
  });

  it('formats JPY (0 decimals) without a decimal point', () => {
    const group = makeGroup({
      name: 'Tokyo',
      baseCurrency: 'JPY',
      members: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
      expenses: [
        makeExpense({
          description: 'Ramen',
          amountMinor: 2000,
          currency: 'JPY',
          payerId: 'a',
        }),
      ],
    });
    const balances = new Map<string, number>([
      ['a', 1000],
      ['b', -1000],
    ]);
    const transfers: Transfer[] = [{ from: 'b', to: 'a', amountMinor: 1000 }];
    const out = formatSettlementSummary(group, balances, transfers);
    expect(out).toContain('Alice · Ramen — ¥2,000');
    expect(out).toContain('Alice: +¥1,000');
    expect(out).toContain('Bob → Alice: ¥1,000');
    expect(out).not.toMatch(/¥\d+\.\d/);
  });

  it('shows the expense in its native currency even when the group base differs (multi-currency)', () => {
    const group = makeGroup({
      name: 'Trip',
      baseCurrency: 'JPY',
      members: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
      expenses: [
        makeExpense({
          description: 'USD coffee',
          amountMinor: 500,
          currency: 'USD',
          rateToBase: 150,
          payerId: 'a',
          createdAt: Date.parse('2026-03-15T00:00:00Z'),
        }),
      ],
    });
    const out = formatSettlementSummary(
      group,
      new Map([['a', 375], ['b', -375]]),
      [{ from: 'b', to: 'a', amountMinor: 375 }],
    );
    expect(out).toContain('USD coffee — $5.00');
    expect(out).toContain('Bob → Alice: ¥375');
    expect(out).toContain('Base currency: JPY');
  });

  it('orders expenses by createdAt ascending regardless of input order', () => {
    const group = makeGroup({
      name: 'Order',
      baseCurrency: 'USD',
      members: [{ id: 'a', name: 'Alice' }],
      expenses: [
        makeExpense({
          id: 'late',
          description: 'Late',
          amountMinor: 100,
          currency: 'USD',
          payerId: 'a',
          createdAt: Date.parse('2026-03-20T00:00:00Z'),
        }),
        makeExpense({
          id: 'early',
          description: 'Early',
          amountMinor: 100,
          currency: 'USD',
          payerId: 'a',
          createdAt: Date.parse('2026-03-10T00:00:00Z'),
        }),
      ],
    });
    const out = formatSettlementSummary(group, new Map([['a', 0]]), []);
    const earlyIdx = out.indexOf('Early');
    const lateIdx = out.indexOf('Late');
    expect(earlyIdx).toBeGreaterThan(-1);
    expect(lateIdx).toBeGreaterThan(earlyIdx);
  });
});
