import { beforeEach, describe, expect, it } from 'vitest';
import { clearImageCache, putImage, rehydrateHistoryBlocks } from '../../state/imageCache';
import type { ChatMessage } from '../../lib/llm/types';

function msg(id: string, role: 'user' | 'assistant', blocks: ChatMessage['blocks']): ChatMessage {
  return { id, role, blocks, createdAt: 0 };
}

describe('rehydrateHistoryBlocks', () => {
  beforeEach(() => clearImageCache());

  it('restores base64 from cache for a user image block whose message id is cached', () => {
    putImage('m1', 'REAL_BYTES');
    const out = rehydrateHistoryBlocks([
      msg('m1', 'user', [{ type: 'image', mediaType: 'image/png', base64: '' }]),
    ]);
    expect(out[0].blocks[0]).toEqual({ type: 'image', mediaType: 'image/png', base64: 'REAL_BYTES' });
  });

  it('replaces image block with a text placeholder when the cache has no entry', () => {
    const out = rehydrateHistoryBlocks([
      msg('m1', 'user', [{ type: 'image', mediaType: 'image/png', base64: '' }]),
    ]);
    expect(out[0].blocks[0].type).toBe('text');
    if (out[0].blocks[0].type === 'text') {
      expect(out[0].blocks[0].text).toMatch(/image previously attached/);
    }
  });

  it('leaves text / tool_use / tool_result blocks untouched', () => {
    const blocks: ChatMessage['blocks'] = [
      { type: 'text', text: 'hello' },
      { type: 'tool_use', id: 't1', name: 'resolve_name', input: { q: 'a' } },
      { type: 'tool_result', toolUseId: 't1', content: [{ type: 'text', text: 'ok' }] },
    ];
    const out = rehydrateHistoryBlocks([msg('m1', 'assistant', blocks)]);
    expect(out[0].blocks).toEqual(blocks);
  });

  it('rehydrates only the matching message — other messages stay stripped or placeholdered', () => {
    putImage('m1', 'BYTES_ONE');
    const out = rehydrateHistoryBlocks([
      msg('m1', 'user', [{ type: 'image', mediaType: 'image/png', base64: '' }]),
      msg('m2', 'user', [{ type: 'image', mediaType: 'image/png', base64: '' }]),
    ]);
    expect(out[0].blocks[0]).toMatchObject({ type: 'image', base64: 'BYTES_ONE' });
    expect(out[1].blocks[0].type).toBe('text');
  });

  it('handles a message with mixed text + image blocks without reordering', () => {
    putImage('m1', 'BYTES');
    const out = rehydrateHistoryBlocks([
      msg('m1', 'user', [
        { type: 'text', text: 'receipt:' },
        { type: 'image', mediaType: 'image/jpeg', base64: '' },
        { type: 'text', text: 'thanks' },
      ]),
    ]);
    expect(out[0].blocks[0]).toEqual({ type: 'text', text: 'receipt:' });
    expect(out[0].blocks[1]).toEqual({ type: 'image', mediaType: 'image/jpeg', base64: 'BYTES' });
    expect(out[0].blocks[2]).toEqual({ type: 'text', text: 'thanks' });
  });

  it('no-op on empty history', () => {
    expect(rehydrateHistoryBlocks([])).toEqual([]);
  });
});
