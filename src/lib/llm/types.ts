import type { CurrencyCode, Member, SplitEntry, SplitMode } from '../../types';

export interface ExpenseDraft {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  splitMode: SplitMode;
  split: SplitEntry[];
  unresolvedNames?: string[];
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mediaType: ImageMediaType }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: ContentBlock[]; isError?: boolean };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: ContentBlock[];
  createdAt: number;
  usage?: TokenUsage;
  drafts?: ExpenseDraft[];
  costUsdMicros?: number;
  modelId?: ModelId;
  elapsedMs?: number;
  sentInPlanMode?: boolean;
}

export type ModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  | 'gpt-4.1-mini'
  | 'gpt-4.1'
  | 'gpt-4o-mini'
  | 'gpt-5'
  | 'gpt-5-mini';

export interface ChatContext {
  members: Member[];
  baseCurrency: CurrencyCode;
  rateHints: Partial<Record<CurrencyCode, number>>;
  history: ChatMessage[];
  model: ModelId;
}

export type ReasoningEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high';

export type AgentPhase =
  | { kind: 'starting' }
  | { kind: 'thinking' }
  | { kind: 'calling_tool'; name: string }
  | { kind: 'tool_done'; name: string; ok: boolean };

export interface SendOptions {
  signal?: AbortSignal;
  onPartialText?: (partialAssistantText: string) => void;
  onPhase?: (phase: AgentPhase) => void;
}
