import type { ModelId, ReasoningEffort } from './types';

// reasoningKind distinguishes models that reason intrinsically (OpenAI GPT-5 family —
// reasoning_effort is mandatory), models where reasoning is opt-in via a `thinking`
// param (Anthropic Sonnet/Opus/Haiku 4.x), and models without reasoning support.
// Cf. claw-code/rust/crates/api/src/providers/openai_compat.rs:774-790 for the
// is_reasoning_model() helper this mirrors.
export type ReasoningKind = 'none' | 'intrinsic' | 'optional';

export interface Model {
  id: ModelId;
  provider: 'anthropic' | 'openai';
  displayName: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  supportsVision: true;
  priceInputMicrosPerMillion: number;
  priceOutputMicrosPerMillion: number;
  imageFlatTokens: number;
  reasoningKind: ReasoningKind;
  lastVerifiedIso: string;
}

export const MODELS: Record<ModelId, Model> = {
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    supportsVision: true,
    priceInputMicrosPerMillion: 1_000_000,
    priceOutputMicrosPerMillion: 5_000_000,
    imageFlatTokens: 1590,
    reasoningKind: 'optional',
    lastVerifiedIso: '2026-04-19',
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    supportsVision: true,
    priceInputMicrosPerMillion: 3_000_000,
    priceOutputMicrosPerMillion: 15_000_000,
    imageFlatTokens: 1590,
    reasoningKind: 'optional',
    lastVerifiedIso: '2026-04-19',
  },
  'claude-opus-4-7': {
    id: 'claude-opus-4-7',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    contextWindowTokens: 200_000,
    maxOutputTokens: 128_000,
    supportsVision: true,
    priceInputMicrosPerMillion: 15_000_000,
    priceOutputMicrosPerMillion: 75_000_000,
    imageFlatTokens: 1590,
    reasoningKind: 'optional',
    lastVerifiedIso: '2026-04-19',
  },
  'gpt-4.1-mini': {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    displayName: 'GPT-4.1 mini',
    contextWindowTokens: 1_047_576,
    maxOutputTokens: 32_768,
    supportsVision: true,
    priceInputMicrosPerMillion: 400_000,
    priceOutputMicrosPerMillion: 1_600_000,
    imageFlatTokens: 0,
    reasoningKind: 'none',
    lastVerifiedIso: '2026-04-19',
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    contextWindowTokens: 1_047_576,
    maxOutputTokens: 32_768,
    supportsVision: true,
    priceInputMicrosPerMillion: 2_000_000,
    priceOutputMicrosPerMillion: 8_000_000,
    imageFlatTokens: 0,
    reasoningKind: 'none',
    lastVerifiedIso: '2026-04-19',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o mini',
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    supportsVision: true,
    priceInputMicrosPerMillion: 150_000,
    priceOutputMicrosPerMillion: 600_000,
    imageFlatTokens: 0,
    reasoningKind: 'none',
    lastVerifiedIso: '2026-04-19',
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    provider: 'openai',
    displayName: 'GPT-5 mini (reasoning)',
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    supportsVision: true,
    priceInputMicrosPerMillion: 250_000,
    priceOutputMicrosPerMillion: 2_000_000,
    imageFlatTokens: 0,
    reasoningKind: 'intrinsic',
    lastVerifiedIso: '2026-04-19',
  },
  'gpt-5': {
    id: 'gpt-5',
    provider: 'openai',
    displayName: 'GPT-5 (reasoning)',
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    supportsVision: true,
    priceInputMicrosPerMillion: 1_250_000,
    priceOutputMicrosPerMillion: 10_000_000,
    imageFlatTokens: 0,
    reasoningKind: 'intrinsic',
    lastVerifiedIso: '2026-04-19',
  },
};

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

export const DEFAULT_MODEL_ID: Record<'anthropic' | 'openai', ModelId> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
};

export function getModel(id: ModelId): Model {
  const m = MODELS[id];
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function isModelId(value: string): value is ModelId {
  return Object.prototype.hasOwnProperty.call(MODELS, value);
}

// Cf. claw-code/rust/crates/api/src/providers/openai_compat.rs:774-790
// (is_reasoning_model) — OpenAI reasoning models (o-series / GPT-5) reject
// max_tokens/temperature/top_p and require max_completion_tokens + reasoning_effort.
export function isReasoningModel(id: ModelId): boolean {
  return MODELS[id].reasoningKind === 'intrinsic';
}

export function supportsOptionalThinking(id: ModelId): boolean {
  return MODELS[id].reasoningKind === 'optional';
}

export function thinkingBudgetFor(effort: ReasoningEffort): number | null {
  switch (effort) {
    case 'off':
      return null;
    case 'minimal':
      return 1024;
    case 'low':
      return 4096;
    case 'medium':
      return 16_000;
    case 'high':
      return 32_000;
  }
}
