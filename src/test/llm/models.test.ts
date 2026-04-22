import { afterEach, describe, expect, it } from 'vitest';
import {
  MODELS,
  MODEL_IDS,
  DEFAULT_MODEL_ID,
  getModel,
  isModelId,
  isReasoningModel,
  resetLocalModelRuntime,
  setLocalModelRuntime,
  supportsOptionalThinking,
  thinkingBudgetFor,
} from '../../lib/llm/models';
import type { ModelId, ReasoningEffort } from '../../lib/llm/types';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-04-19T00:00:00Z');
const REMOTE_IDS: ModelId[] = MODEL_IDS.filter((id) => id !== 'local');

afterEach(() => resetLocalModelRuntime());

describe('model registry', () => {
  it('lists eight remote vision-capable models across Anthropic (3) and OpenAI (5), plus the local entry', () => {
    expect(REMOTE_IDS).toHaveLength(8);
    expect(MODEL_IDS).toContain('local');
    const providers = REMOTE_IDS.map((id) => MODELS[id].provider);
    expect(providers.filter((p) => p === 'anthropic')).toHaveLength(3);
    expect(providers.filter((p) => p === 'openai')).toHaveLength(5);
    for (const id of REMOTE_IDS) {
      expect(MODELS[id].supportsVision).toBe(true);
    }
  });

  it('includes gpt-5-mini and gpt-5 as intrinsic-reasoning OpenAI models with 400k context', () => {
    for (const id of ['gpt-5-mini', 'gpt-5'] as const) {
      const m = MODELS[id];
      expect(m.provider).toBe('openai');
      expect(m.reasoningKind).toBe('intrinsic');
      expect(m.contextWindowTokens).toBe(400_000);
      expect(m.maxOutputTokens).toBe(128_000);
      expect(m.supportsVision).toBe(true);
    }
    expect(MODELS['gpt-5-mini'].priceInputMicrosPerMillion).toBe(250_000);
    expect(MODELS['gpt-5-mini'].priceOutputMicrosPerMillion).toBe(2_000_000);
    expect(MODELS['gpt-5'].priceInputMicrosPerMillion).toBe(1_250_000);
    expect(MODELS['gpt-5'].priceOutputMicrosPerMillion).toBe(10_000_000);
  });

  it('marks the three Claude 4.x models as optional-reasoning', () => {
    for (const id of ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] as const) {
      expect(MODELS[id].reasoningKind).toBe('optional');
    }
  });

  it('marks the non-GPT-5 OpenAI models as non-reasoning', () => {
    for (const id of ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'] as const) {
      expect(MODELS[id].reasoningKind).toBe('none');
    }
  });

  it('marks the local entry as a non-reasoning, zero-priced, default-text-only model', () => {
    const m = MODELS.local;
    expect(m.provider).toBe('local');
    expect(m.reasoningKind).toBe('none');
    expect(m.priceInputMicrosPerMillion).toBe(0);
    expect(m.priceOutputMicrosPerMillion).toBe(0);
    expect(m.imageFlatTokens).toBe(0);
    expect(m.supportsVision).toBe(false);
  });

  it('reflects setLocalModelRuntime() values in MODELS.local on the next read', () => {
    setLocalModelRuntime({
      contextWindowTokens: 65_536,
      maxOutputTokens: 8_192,
      supportsVision: true,
    });
    expect(MODELS.local.contextWindowTokens).toBe(65_536);
    expect(MODELS.local.maxOutputTokens).toBe(8_192);
    expect(MODELS.local.supportsVision).toBe(true);
    expect(getModel('local').contextWindowTokens).toBe(65_536);
  });

  it('resetLocalModelRuntime() restores defaults', () => {
    setLocalModelRuntime({
      contextWindowTokens: 65_536,
      maxOutputTokens: 8_192,
      supportsVision: true,
    });
    resetLocalModelRuntime();
    expect(MODELS.local.contextWindowTokens).toBe(32_768);
    expect(MODELS.local.maxOutputTokens).toBe(4_096);
    expect(MODELS.local.supportsVision).toBe(false);
  });

  it('defaults OpenAI to gpt-5-mini', () => {
    expect(DEFAULT_MODEL_ID.openai).toBe('gpt-5-mini');
  });

  it('stores prices as positive integer micro-USD per million tokens (remote providers only — local is free)', () => {
    for (const id of REMOTE_IDS) {
      const m = MODELS[id];
      expect(Number.isInteger(m.priceInputMicrosPerMillion)).toBe(true);
      expect(Number.isInteger(m.priceOutputMicrosPerMillion)).toBe(true);
      expect(m.priceInputMicrosPerMillion).toBeGreaterThan(0);
      expect(m.priceOutputMicrosPerMillion).toBeGreaterThan(0);
      expect(m.contextWindowTokens).toBeGreaterThan(0);
    }
  });

  it('every entry has a positive integer maxOutputTokens under 1M', () => {
    for (const id of MODEL_IDS) {
      const m = MODELS[id];
      expect(Number.isInteger(m.maxOutputTokens)).toBe(true);
      expect(m.maxOutputTokens).toBeGreaterThan(0);
      expect(m.maxOutputTokens).toBeLessThanOrEqual(1_000_000);
    }
  });

  it('has Anthropic imageFlatTokens set, OpenAI and local left at 0 (tile math handled elsewhere)', () => {
    for (const id of MODEL_IDS) {
      const m = MODELS[id];
      if (m.provider === 'anthropic') expect(m.imageFlatTokens).toBeGreaterThan(0);
      else expect(m.imageFlatTokens).toBe(0);
    }
  });

  it('DEFAULT_MODEL_ID entries exist in the registry for every provider including local', () => {
    expect(MODELS[DEFAULT_MODEL_ID.anthropic]).toBeDefined();
    expect(MODELS[DEFAULT_MODEL_ID.openai]).toBeDefined();
    expect(DEFAULT_MODEL_ID.local).toBe('local');
  });

  it('every remote entry has a lastVerifiedIso within the last 12 months (local is user-declared, excluded)', () => {
    for (const id of REMOTE_IDS) {
      const verified = Date.parse(MODELS[id].lastVerifiedIso);
      expect(Number.isFinite(verified)).toBe(true);
      expect(NOW_MS - verified).toBeLessThanOrEqual(ONE_YEAR_MS);
    }
  });

  it('getModel throws for an unknown id', () => {
    expect(() => getModel('gpt-3.5' as never)).toThrow(/Unknown model id/);
  });

  it('isModelId narrows strings that are in the registry and rejects others', () => {
    expect(isModelId('claude-haiku-4-5')).toBe(true);
    expect(isModelId('claude-sonnet-4-6')).toBe(true);
    expect(isModelId('gpt-5')).toBe(true);
    expect(isModelId('gpt-5-mini')).toBe(true);
    expect(isModelId('local')).toBe(true);
    expect(isModelId('gpt-3.5')).toBe(false);
    expect(isModelId('')).toBe(false);
  });
});

describe('reasoning-model helpers', () => {
  it('isReasoningModel is true only for GPT-5 family', () => {
    for (const id of MODEL_IDS) {
      const expected = id === 'gpt-5' || id === 'gpt-5-mini';
      expect(isReasoningModel(id)).toBe(expected);
    }
  });

  it('supportsOptionalThinking is true only for Claude 4.x', () => {
    for (const id of MODEL_IDS) {
      const expected =
        id === 'claude-haiku-4-5' || id === 'claude-sonnet-4-6' || id === 'claude-opus-4-7';
      expect(supportsOptionalThinking(id)).toBe(expected);
    }
  });

  it('thinkingBudgetFor maps each ReasoningEffort to the documented budget', () => {
    const table: Array<[ReasoningEffort, number | null]> = [
      ['off', null],
      ['minimal', 1024],
      ['low', 4096],
      ['medium', 16_000],
      ['high', 32_000],
    ];
    for (const [effort, expected] of table) {
      expect(thinkingBudgetFor(effort)).toBe(expected);
    }
  });
});
