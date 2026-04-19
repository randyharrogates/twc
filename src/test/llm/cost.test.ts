import { describe, expect, it } from 'vitest';
import { usageToMicroUsd, microUsdToUsd, dayKey, monthKey } from '../../lib/llm/cost';
import { MODELS, MODEL_IDS } from '../../lib/llm/models';

describe('usageToMicroUsd', () => {
  it('returns zero for zero tokens, regardless of model', () => {
    for (const id of MODEL_IDS) {
      expect(usageToMicroUsd({ inputTokens: 0, outputTokens: 0 }, MODELS[id])).toBe(0);
    }
  });

  it('returns an integer for every registry entry at 1M in / 1M out', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    for (const id of MODEL_IDS) {
      const m = MODELS[id];
      const result = usageToMicroUsd(usage, m);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBe(m.priceInputMicrosPerMillion + m.priceOutputMicrosPerMillion);
    }
  });

  it('computes Claude Haiku 4.5 cost for a typical receipt turn (1.5k in / 400 out)', () => {
    const m = MODELS['claude-haiku-4-5'];
    const usage = { inputTokens: 1500, outputTokens: 400 };
    // 1500 * 1_000_000 / 1_000_000 = 1500; 400 * 5_000_000 / 1_000_000 = 2000
    expect(usageToMicroUsd(usage, m)).toBe(1500 + 2000);
  });

  it('computes GPT-4.1 mini cost for the same turn', () => {
    const m = MODELS['gpt-4.1-mini'];
    const usage = { inputTokens: 1500, outputTokens: 400 };
    // 1500 * 400_000 / 1_000_000 = 600; 400 * 1_600_000 / 1_000_000 = 640
    expect(usageToMicroUsd(usage, m)).toBe(600 + 640);
  });

  it('rounds at each token boundary, not at the sum', () => {
    const m = MODELS['claude-haiku-4-5'];
    // 1 input token at $1/M = 1 micro-USD; 1 output token at $5/M = 5 micro-USD
    expect(usageToMicroUsd({ inputTokens: 1, outputTokens: 1 }, m)).toBe(1 + 5);
  });

  it('matches Claude Opus 4.7 at 10k/2k (15k + 150k micros)', () => {
    const m = MODELS['claude-opus-4-7'];
    const usage = { inputTokens: 10_000, outputTokens: 2000 };
    expect(usageToMicroUsd(usage, m)).toBe(10_000 * 15 + 2_000 * 75);
  });

  it('microUsdToUsd is a pure float divide', () => {
    expect(microUsdToUsd(5_000_000)).toBe(5);
    expect(microUsdToUsd(0)).toBe(0);
    expect(microUsdToUsd(1_234_567)).toBeCloseTo(1.234567, 6);
  });
});

describe('dayKey / monthKey', () => {
  it('formats UTC day and month keys zero-padded', () => {
    const ts = Date.parse('2026-01-05T12:34:56Z');
    expect(dayKey(ts)).toBe('2026-01-05');
    expect(monthKey(ts)).toBe('2026-01');
  });

  it('rolls to the next UTC day at midnight', () => {
    const before = Date.parse('2026-04-18T23:59:59Z');
    const after = Date.parse('2026-04-19T00:00:01Z');
    expect(dayKey(before)).toBe('2026-04-18');
    expect(dayKey(after)).toBe('2026-04-19');
  });
});
