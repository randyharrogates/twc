import { describe, expect, it } from 'vitest';
import { executeSubmitDrafts, submitDraftsTool } from '../../../lib/llm/tools/submit_drafts';
import type { Group } from '../../../types';

function mkGroup(): Group {
  return {
    id: 'g1',
    name: 'Trip',
    baseCurrency: 'USD',
    createdAt: 0,
    members: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ],
    expenses: [],
    rateHints: {},
  };
}

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Dinner',
    amountMinor: 5000,
    currency: 'USD',
    rateToBase: 1,
    payerId: 'a',
    splitMode: 'even',
    split: [
      { memberId: 'a', value: 1 },
      { memberId: 'b', value: 1 },
    ],
    unresolvedNames: [],
    ...overrides,
  };
}

describe('submitDraftsTool spec', () => {
  it('is read-only (does not mutate store) and named submit_drafts', () => {
    const spec = submitDraftsTool(['a', 'b']);
    expect(spec.name).toBe('submit_drafts');
    expect(spec.mutating).toBe(false);
  });

  it('reuses the shared AssistantResponseSchema JSON schema (has drafts + assistantText)', () => {
    const spec = submitDraftsTool(['a', 'b']);
    const props = spec.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(['assistantText', 'drafts']);
  });
});

describe('executeSubmitDrafts', () => {
  it('validates a well-formed payload and returns its structured form in `content`', async () => {
    const res = await executeSubmitDrafts(mkGroup(), {
      assistantText: 'looks good',
      drafts: [validDraft()],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { drafts: unknown[]; assistantText: string };
      expect(parsed.drafts).toHaveLength(1);
      expect(parsed.assistantText).toBe('looks good');
    }
  });

  it('rejects a payload whose payerId is not a group member (per-group isolation)', async () => {
    const res = await executeSubmitDrafts(mkGroup(), {
      assistantText: 'x',
      drafts: [validDraft({ payerId: 'outsider' })],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a payload whose currency is not in the 9-code allow-list', async () => {
    const res = await executeSubmitDrafts(mkGroup(), {
      assistantText: 'x',
      drafts: [validDraft({ currency: 'XYZ' })],
    });
    expect(res.ok).toBe(false);
  });

  it('accepts a 0-decimal JPY receipt with integer amountMinor (invariant preserved)', async () => {
    const res = await executeSubmitDrafts(mkGroup(), {
      assistantText: 'jpy',
      drafts: [validDraft({ currency: 'JPY', amountMinor: 500, rateToBase: 0.0067 })],
    });
    expect(res.ok).toBe(true);
  });
});
