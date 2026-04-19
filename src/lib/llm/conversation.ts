import { getModel, type Model } from './models';
import { estimateMessageTokens } from './preflight';
import type { ChatMessage, ContentBlock, ModelId } from './types';

export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  [key: string]: unknown;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  [key: string]: unknown;
}

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | OpenAIContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

export function blockToAnthropic(block: ContentBlock): AnthropicContentBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'image':
      return {
        type: 'image',
        source: { type: 'base64', media_type: block.mediaType, data: block.base64 },
      };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content.map(blockToAnthropic),
        is_error: block.isError ?? false,
      };
  }
}

export function blocksToAnthropicContent(blocks: ContentBlock[]): AnthropicContentBlock[] {
  return blocks.map(blockToAnthropic);
}

const DROPPED_MARKER: ChatMessage = {
  id: '__pruned__',
  role: 'assistant',
  blocks: [{ type: 'text', text: '(earlier conversation hidden to stay under the context window)' }],
  createdAt: 0,
};

export function pruneHistory(
  history: ChatMessage[],
  modelId: ModelId,
  softBudgetRatio = 0.6,
): ChatMessage[] {
  if (history.length === 0) return history;
  const model = getModel(modelId);
  const budget = Math.floor(model.contextWindowTokens * softBudgetRatio);
  const tokens = history.map((m) => estimateMessageTokens(m, model));
  const total = tokens.reduce((a, b) => a + b, 0);
  if (total <= budget) return history;

  const lastPairStart = findLastUserAssistantPairStart(history);
  const keptStart = trimFromFront(tokens, budget, lastPairStart);
  if (keptStart === 0) return history;

  const droppedOldestAt = history[0].createdAt;
  const marker: ChatMessage = { ...DROPPED_MARKER, createdAt: droppedOldestAt };
  return [marker, ...history.slice(keptStart)];
}

function findLastUserAssistantPairStart(history: ChatMessage[]): number {
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].role === 'user' && history[i + 1].role === 'assistant') return i;
  }
  return Math.max(0, history.length - 1);
}

function trimFromFront(tokens: number[], budget: number, mustKeepFromIdx: number): number {
  let start = 0;
  let total = tokens.reduce((a, b) => a + b, 0);
  while (start < mustKeepFromIdx && total > budget) {
    total -= tokens[start];
    start++;
  }
  return start;
}

export type { Model };
