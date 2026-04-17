import { describe, expect, it } from 'vitest';
import { MockLLMClient } from '../lib/llm/mockClient';
import type { Member } from '../types';

const members: Member[] = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' },
];

const client = new MockLLMClient();

async function parse(text: string, overrides: object = {}) {
  return client.parseExpenses(text, {
    members,
    baseCurrency: 'USD',
    rateHints: {},
    ...overrides,
  });
}

describe('MockLLMClient', () => {
  it('parses "Alice paid 50 for dinner split with Bob and Charlie"', async () => {
    const res = await parse('Alice paid 50 for dinner split with Bob and Charlie');
    expect(res).toHaveProperty('drafts');
    if ('drafts' in res) {
      expect(res.drafts).toHaveLength(1);
      const d = res.drafts[0];
      expect(d.description).toBe('dinner');
      expect(d.amountMinor).toBe(5000);
      expect(d.currency).toBe('USD');
      expect(d.payerId).toBe('a');
      const participants = d.split.filter((s) => s.value === 1).map((s) => s.memberId).sort();
      expect(participants).toEqual(['b', 'c']);
    }
  });

  it('falls back to all members when no split clause is given', async () => {
    const res = await parse('Bob paid 30 for coffee');
    if ('drafts' in res) {
      const participants = res.drafts[0].split.filter((s) => s.value === 1).map((s) => s.memberId).sort();
      expect(participants).toEqual(['a', 'b', 'c']);
    } else {
      throw new Error('expected drafts');
    }
  });

  it('detects currency by symbol', async () => {
    const res = await parse('Alice paid ¥6000 for sushi', { baseCurrency: 'JPY' });
    if ('drafts' in res) {
      expect(res.drafts[0].currency).toBe('JPY');
      expect(res.drafts[0].amountMinor).toBe(6000);
    } else {
      throw new Error('expected drafts');
    }
  });

  it('returns a parseError for gibberish', async () => {
    const res = await parse('what is this');
    expect(res).toHaveProperty('parseError');
  });

  it('returns a parseError when the payer is unknown', async () => {
    const res = await parse('Zebra paid 10 for x');
    expect(res).toHaveProperty('parseError');
  });

  it('fuzzy-matches a misspelled member name (≤2 edits)', async () => {
    const res = await parse('Alicia paid 10 for x');
    if ('drafts' in res) {
      expect(res.drafts[0].payerId).toBe('a');
    } else {
      throw new Error('expected drafts');
    }
  });

  it('flags unresolved split names', async () => {
    const res = await parse('Alice paid 10 for x split with Bob and Zelda');
    if ('drafts' in res) {
      expect(res.drafts[0].unresolvedNames).toEqual(['Zelda']);
    } else {
      throw new Error('expected drafts');
    }
  });
});
