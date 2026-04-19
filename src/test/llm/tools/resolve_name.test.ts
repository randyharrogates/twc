import { describe, expect, it } from 'vitest';
import { executeResolveName, resolveNameTool } from '../../../lib/llm/tools/resolve_name';
import type { Group } from '../../../types';

function mkGroup(): Group {
  return {
    id: 'g1',
    name: 'Trip',
    baseCurrency: 'USD',
    createdAt: 0,
    members: [
      { id: 'm1', name: 'Marcus' },
      { id: 'm2', name: 'Mark' },
      { id: 'm3', name: 'Alice' },
    ],
    expenses: [],
    rateHints: {},
  };
}

describe('resolveNameTool spec', () => {
  it('is marked read-only (not mutating) and named resolve_name', () => {
    const spec = resolveNameTool();
    expect(spec.name).toBe('resolve_name');
    expect(spec.mutating).toBe(false);
  });
});

describe('executeResolveName', () => {
  it('returns the top fuzzy match for an exact name at confidence 1', async () => {
    const res = await executeResolveName(mkGroup(), { query: 'Marcus' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { matches: Array<{ id: string; confidence: number }> };
      expect(parsed.matches[0].id).toBe('m1');
      expect(parsed.matches[0].confidence).toBe(1);
    }
  });

  it('returns an empty list when nothing matches above the threshold', async () => {
    const res = await executeResolveName(mkGroup(), { query: 'Zoltan' });
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { matches: unknown[] };
      expect(parsed.matches).toEqual([]);
    }
  });

  it('returns ok:false when query is empty', async () => {
    const res = await executeResolveName(mkGroup(), { query: '' });
    expect(res.ok).toBe(false);
  });
});
