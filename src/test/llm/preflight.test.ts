import { describe, expect, it } from 'vitest';
import {
  preflight,
  estimateBlockTokens,
  estimateMessageTokens,
  estimateCostMicros,
  MAX_IMAGE_BYTES_POST_B64,
} from '../../lib/llm/preflight';
import { MODELS } from '../../lib/llm/models';
import type { ChatContext, ChatMessage, ContentBlock } from '../../lib/llm/types';

function baseCtx(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    members: [{ id: 'a', name: 'Alice' }],
    baseCurrency: 'USD',
    rateHints: {},
    history: [],
    model: 'claude-haiku-4-5',
    ...overrides,
  };
}

function textBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

function imageBlock(sizeBytes: number): ContentBlock {
  const base64Len = Math.ceil((sizeBytes / 3) * 4);
  return { type: 'image', mediaType: 'image/jpeg', base64: 'a'.repeat(base64Len) };
}

describe('estimateBlockTokens', () => {
  it('estimates text at ceil(chars/4) with a minimum of 1', () => {
    expect(estimateBlockTokens(textBlock('a'), MODELS['claude-haiku-4-5'])).toBe(1);
    expect(estimateBlockTokens(textBlock('hello world!'), MODELS['claude-haiku-4-5'])).toBe(3);
  });

  it('uses the model.imageFlatTokens for Anthropic images', () => {
    const tokens = estimateBlockTokens(imageBlock(100_000), MODELS['claude-sonnet-4-6']);
    expect(tokens).toBe(MODELS['claude-sonnet-4-6'].imageFlatTokens);
  });

  it('uses tile math (base 85 + N*170) for OpenAI images', () => {
    const tokens = estimateBlockTokens(imageBlock(100_000), MODELS['gpt-4.1-mini']);
    expect(tokens).toBeGreaterThanOrEqual(85 + 170);
    expect(tokens).toBeLessThanOrEqual(85 + 16 * 170);
  });

  it('recurses into tool_result contents', () => {
    const inner: ContentBlock[] = [textBlock('abcd'), textBlock('efgh')];
    const toolResult: ContentBlock = { type: 'tool_result', toolUseId: 't', content: inner };
    expect(estimateBlockTokens(toolResult, MODELS['claude-haiku-4-5'])).toBe(2);
  });
});

describe('estimateMessageTokens', () => {
  it('sums across blocks', () => {
    const msg: ChatMessage = {
      id: 'x',
      role: 'user',
      blocks: [textBlock('abcd'.repeat(8)), imageBlock(10_000)],
      createdAt: 0,
    };
    const model = MODELS['claude-haiku-4-5'];
    const expected = estimateBlockTokens(msg.blocks[0], model) + estimateBlockTokens(msg.blocks[1], model);
    expect(estimateMessageTokens(msg, model)).toBe(expected);
  });
});

describe('preflight — image-byte ceiling', () => {
  it('rejects an image whose post-base64 size exceeds 5 MB', () => {
    const huge = imageBlock(MAX_IMAGE_BYTES_POST_B64 + 1000);
    const r = preflight([huge], baseCtx(), 500, 1000);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/5 MB|MB/);
  });

  it('accepts an image well under 5 MB with text', () => {
    const small = imageBlock(200_000);
    const r = preflight([small, textBlock('Hello')], baseCtx(), 500, 1000);
    expect(r.ok).toBe(true);
  });
});

describe('preflight — context window', () => {
  it('rejects when estimated prompt + max response exceeds the model window', () => {
    const tiny = { ...MODELS['claude-haiku-4-5'] };
    const ctx = baseCtx();
    const longText = 'x'.repeat(200_000 * 4 + 100);
    const r = preflight([textBlock(longText)], ctx, 0, 500);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/context window/);
    void tiny;
  });

  it('accepts a normal request within the window', () => {
    const r = preflight([textBlock('Hello, parse this.')], baseCtx(), 200, 1000);
    expect(r.ok).toBe(true);
    expect(r.estimatedPromptTokens).toBeGreaterThan(0);
  });
});

describe('estimateCostMicros', () => {
  it('returns input+output micros for typical receipt turn', () => {
    const m = MODELS['claude-haiku-4-5'];
    // 1500 prompt + 1000 response → 1500*1M/1M + 1000*5M/1M = 1500 + 5000 = 6500
    expect(estimateCostMicros(1500, 1000, m)).toBe(1500 + 5000);
  });
});
