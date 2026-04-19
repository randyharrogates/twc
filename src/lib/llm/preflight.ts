import { getModel, type Model } from './models';
import type { ChatContext, ChatMessage, ContentBlock } from './types';

export const MAX_IMAGE_BYTES_POST_B64 = 5 * 1024 * 1024;
export const MAX_RAW_FILE_BYTES = 3_800_000;

function textTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

function imageTokensFor(block: Extract<ContentBlock, { type: 'image' }>, model: Model): number {
  if (model.provider === 'anthropic') return model.imageFlatTokens;
  const base = 85;
  const tileTokens = 170;
  const approxBytes = Math.ceil((block.base64.length * 3) / 4);
  const tiles = Math.min(16, Math.max(1, Math.ceil(approxBytes / (512 * 1024))));
  return base + tiles * tileTokens;
}

export function estimateBlockTokens(block: ContentBlock, model: Model): number {
  switch (block.type) {
    case 'text':
      return textTokens(block.text);
    case 'image':
      return imageTokensFor(block, model);
    case 'tool_use':
      return textTokens(JSON.stringify(block.input ?? {}));
    case 'tool_result':
      return block.content.reduce((a, b) => a + estimateBlockTokens(b, model), 0);
  }
}

export function estimateMessageTokens(msg: ChatMessage, model: Model): number {
  return msg.blocks.reduce((a, b) => a + estimateBlockTokens(b, model), 0);
}

export function estimateHistoryTokens(history: ChatMessage[], model: Model): number {
  return history.reduce((a, m) => a + estimateMessageTokens(m, model), 0);
}

export function estimateRequestTokens(
  currentUserBlocks: ContentBlock[],
  ctx: ChatContext,
  systemPromptTokens: number,
): number {
  const model = getModel(ctx.model);
  const hist = estimateHistoryTokens(ctx.history, model);
  const current = currentUserBlocks.reduce((a, b) => a + estimateBlockTokens(b, model), 0);
  return systemPromptTokens + hist + current;
}

export interface PreflightResult {
  ok: boolean;
  estimatedPromptTokens: number;
  reason?: string;
}

export function preflight(
  currentUserBlocks: ContentBlock[],
  ctx: ChatContext,
  systemPromptTokens: number,
  maxResponseTokens: number,
): PreflightResult {
  const model = getModel(ctx.model);
  for (const b of currentUserBlocks) {
    if (b.type === 'image') {
      const approxBytes = Math.ceil((b.base64.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES_POST_B64) {
        return {
          ok: false,
          estimatedPromptTokens: 0,
          reason: `An image is ~${(approxBytes / 1024 / 1024).toFixed(1)} MB after encoding; limit is 5 MB. Crop the receipt or re-save at lower quality.`,
        };
      }
    }
  }
  const promptTokens = estimateRequestTokens(currentUserBlocks, ctx, systemPromptTokens);
  if (promptTokens + maxResponseTokens > model.contextWindowTokens) {
    return {
      ok: false,
      estimatedPromptTokens: promptTokens,
      reason: `Estimated request (~${promptTokens} tokens) + response budget (${maxResponseTokens}) exceeds ${model.displayName}'s context window (${model.contextWindowTokens}). Start a new conversation.`,
    };
  }
  return { ok: true, estimatedPromptTokens: promptTokens };
}

export function estimateCostMicros(
  estimatedPromptTokens: number,
  maxResponseTokens: number,
  model: Model,
): number {
  const input = Math.round((estimatedPromptTokens * model.priceInputMicrosPerMillion) / 1_000_000);
  const output = Math.round((maxResponseTokens * model.priceOutputMicrosPerMillion) / 1_000_000);
  return input + output;
}
