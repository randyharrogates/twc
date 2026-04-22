import { describe, expect, it } from 'vitest';
import { GroupSchema } from '../lib/schema';

function validGroup() {
  return {
    id: 'g1',
    version: 1,
    name: 'Tokyo',
    baseCurrency: 'JPY',
    createdAt: 0,
    members: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    expenses: [
      {
        id: 'e1',
        description: 'Ramen',
        amountMinor: 1200,
        currency: 'JPY',
        rateToBase: 1,
        payerId: 'alice',
        splitMode: 'even' as const,
        split: [
          { memberId: 'alice', value: 1 },
          { memberId: 'bob', value: 1 },
        ],
        createdAt: 0,
      },
    ],
    rateHints: {},
  };
}

describe('GroupSchema', () => {
  it('accepts a valid group', () => {
    expect(GroupSchema.safeParse(validGroup()).success).toBe(true);
  });

  it('rejects a float amountMinor', () => {
    const bad = validGroup();
    bad.expenses[0].amountMinor = 12.5;
    const result = GroupSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown currency code', () => {
    const bad = validGroup();
    (bad as { baseCurrency: string }).baseCurrency = 'CNY';
    expect(GroupSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing version', () => {
    const bad = validGroup() as Partial<ReturnType<typeof validGroup>>;
    delete bad.version;
    expect(GroupSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects additional properties on a group', () => {
    const bad = { ...validGroup(), extra: 1 };
    expect(GroupSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-positive rateToBase', () => {
    const bad = validGroup();
    bad.expenses[0].rateToBase = 0;
    expect(GroupSchema.safeParse(bad).success).toBe(false);
  });
});
