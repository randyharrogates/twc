import { describe, expect, it } from 'vitest';
import { blocksToAnthropicContent, pruneHistory } from '../../lib/llm/conversation';
import type { ChatMessage, ContentBlock } from '../../lib/llm/types';

function msg(role: 'user' | 'assistant', blocks: ContentBlock[], id = Math.random().toString(36)): ChatMessage {
  return { id, role, blocks, createdAt: 0 };
}

describe('blocksToAnthropicContent', () => {
  it('transforms a text block verbatim', () => {
    expect(blocksToAnthropicContent([{ type: 'text', text: 'a' }])).toEqual([{ type: 'text', text: 'a' }]);
  });

  it('encodes images as {type:image, source:{type:base64, media_type, data}}', () => {
    const out = blocksToAnthropicContent([
      { type: 'image', mediaType: 'image/jpeg', base64: 'AAAA' },
    ]);
    expect(out[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
    });
  });

  it('preserves tool_use and tool_result blocks', () => {
    const out = blocksToAnthropicContent([
      { type: 'tool_use', id: 't1', name: 'submit_drafts', input: { x: 1 } },
      { type: 'tool_result', toolUseId: 't1', content: [{ type: 'text', text: 'ok' }] },
    ]);
    expect(out[0]).toMatchObject({ type: 'tool_use', id: 't1', name: 'submit_drafts' });
    expect(out[1]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });
});

describe('pruneHistory', () => {
  function longTextMsg(role: 'user' | 'assistant', approxTokens: number, id: string): ChatMessage {
    return msg(role, [{ type: 'text', text: 'x'.repeat(approxTokens * 4) }], id);
  }

  it('no-ops when total tokens are under the soft budget', () => {
    const h = [longTextMsg('user', 10, 'm1'), longTextMsg('assistant', 10, 'm2')];
    const pruned = pruneHistory(h, 'claude-haiku-4-5');
    expect(pruned).toEqual(h);
  });

  it('drops oldest first and preserves the last user→assistant pair', () => {
    const h = [
      longTextMsg('user', 50_000, 'u1'),
      longTextMsg('assistant', 50_000, 'a1'),
      longTextMsg('user', 50_000, 'u2'),
      longTextMsg('assistant', 50_000, 'a2'),
    ];
    const pruned = pruneHistory(h, 'claude-haiku-4-5');
    expect(pruned[0].id).toBe('__pruned__');
    const ids = pruned.map((m) => m.id);
    expect(ids).toContain('u2');
    expect(ids).toContain('a2');
  });

  it('emits the synthetic marker exactly once regardless of how many messages were dropped', () => {
    const h = [
      longTextMsg('user', 40_000, 'u1'),
      longTextMsg('assistant', 40_000, 'a1'),
      longTextMsg('user', 40_000, 'u2'),
      longTextMsg('assistant', 40_000, 'a2'),
      longTextMsg('user', 40_000, 'u3'),
      longTextMsg('assistant', 40_000, 'a3'),
    ];
    const pruned = pruneHistory(h, 'claude-haiku-4-5');
    const markers = pruned.filter((m) => m.id === '__pruned__');
    expect(markers).toHaveLength(1);
  });
});
