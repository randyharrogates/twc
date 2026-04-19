import { blocksToAnthropicContent, type AnthropicMessage } from './conversation';
import { AuthError, NetworkError, ProviderRateLimitError, TruncationError } from './errors';
import { getModel, supportsOptionalThinking, thinkingBudgetFor } from './models';
import { iterateSse } from './streaming';
import type {
  AgentClient,
  AgentTurnRequest,
  AssistantResponseBlock,
  AssistantTurnResult,
  StopReason,
} from './agent';
import type { ToolSpec } from './tools/registry';
import type { SendOptions } from './types';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
const PROVIDER = 'anthropic';

export interface AnthropicClientOptions {
  apiKey: string;
  maxTokens?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

export class AnthropicClient implements AgentClient {
  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicClientOptions) {
    if (!opts.apiKey) throw new AuthError(PROVIDER, 'apiKey is required.');
    this.apiKey = opts.apiKey;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async sendTurn(req: AgentTurnRequest, opts?: SendOptions): Promise<AssistantTurnResult> {
    const messages: AnthropicMessage[] = req.messages.map((m) => ({
      role: m.role,
      content: blocksToAnthropicContent(m.blocks),
    }));
    const cap = getModel(req.model).maxOutputTokens;
    const initial = req.maxTokens ?? this.maxTokens;
    let budget = Math.min(initial, cap);
    for (;;) {
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: budget,
        system: req.system,
        messages,
        stream: true,
        tools: req.tools.map(toAnthropicToolDef),
        tool_choice: 'auto',
      };
      if (supportsOptionalThinking(req.model)) {
        const thinkingBudget = thinkingBudgetFor(req.reasoningEffort ?? 'off');
        if (thinkingBudget !== null) {
          body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
        }
      }
      const response = await this.fetchWithRetry(body, opts?.signal);
      const result = await this.parseTurnStream(response, opts);
      if (result.stopReason !== 'max_tokens') return result;
      if (budget >= cap) {
        throw new TruncationError(PROVIDER, cap, result.requestId);
      }
      budget = Math.min(budget * 4, cap);
      opts?.onPartialText?.('');
    }
  }

  private async parseTurnStream(response: Response, opts?: SendOptions): Promise<AssistantTurnResult> {
    const requestId = requestIdFromHeaders(response) ?? undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: StopReason = 'end_turn';
    interface TextAcc { kind: 'text'; text: string }
    interface ToolAcc { kind: 'tool_use'; id: string; name: string; json: string }
    const accByIndex = new Map<number, TextAcc | ToolAcc>();
    const orderedIndexes: number[] = [];
    let lastReportedText: string | null = null;

    for await (const ev of iterateSse(response)) {
      if (!ev.data) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = ev.event ?? (parsed.type as string | undefined);
      if (type === 'message_start') {
        const msg = parsed.message as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
        if (msg?.usage?.input_tokens != null) inputTokens = msg.usage.input_tokens;
        if (msg?.usage?.output_tokens != null) outputTokens = msg.usage.output_tokens;
      } else if (type === 'content_block_start') {
        const idx = parsed.index as number | undefined;
        const cb = parsed.content_block as { type?: string; id?: string; name?: string } | undefined;
        if (idx === undefined || !cb) continue;
        if (cb.type === 'text') {
          accByIndex.set(idx, { kind: 'text', text: '' });
          orderedIndexes.push(idx);
        } else if (cb.type === 'tool_use' && cb.id && cb.name) {
          accByIndex.set(idx, { kind: 'tool_use', id: cb.id, name: cb.name, json: '' });
          orderedIndexes.push(idx);
          opts?.onPhase?.({ kind: 'calling_tool', name: cb.name });
        }
      } else if (type === 'content_block_delta') {
        const idx = parsed.index as number | undefined;
        const delta = parsed.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (idx === undefined || !delta) continue;
        const entry = accByIndex.get(idx);
        if (!entry) continue;
        if (delta.type === 'text_delta' && typeof delta.text === 'string' && entry.kind === 'text') {
          entry.text += delta.text;
          if (opts?.onPartialText && entry.text !== lastReportedText) {
            lastReportedText = entry.text;
            opts.onPartialText(entry.text);
          }
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && entry.kind === 'tool_use') {
          entry.json += delta.partial_json;
        }
      } else if (type === 'message_delta') {
        const delta = parsed.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) stopReason = toStopReason(delta.stop_reason);
        const usage = parsed.usage as { output_tokens?: number } | undefined;
        if (usage?.output_tokens != null) outputTokens = usage.output_tokens;
      }
    }

    const blocks: AssistantResponseBlock[] = [];
    for (const idx of orderedIndexes) {
      const e = accByIndex.get(idx);
      if (!e) continue;
      if (e.kind === 'text') {
        if (e.text.length > 0) blocks.push({ type: 'text', text: e.text });
      } else {
        let input: unknown = {};
        if (e.json.trim().length > 0) {
          try {
            input = JSON.parse(e.json);
          } catch {
            input = {};
          }
        }
        blocks.push({ type: 'tool_use', id: e.id, name: e.name, input });
      }
    }
    return {
      blocks,
      usage: { inputTokens, outputTokens },
      stopReason,
      requestId,
    };
  }

  private async fetchWithRetry(body: unknown, signal?: AbortSignal): Promise<Response> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const res = await this.fetchImpl(ANTHROPIC_ENDPOINT, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        });
        if (res.ok) return res;
        await handleErrorResponse(res);
      } catch (err) {
        lastErr = err;
        if (isAbortError(err)) throw err;
        if (err instanceof AuthError || err instanceof ProviderRateLimitError) throw err;
        if (!(err instanceof NetworkError)) throw err;
        if (attempt >= this.maxRetries) break;
        const delay = this.baseDelayMs * 2 ** attempt;
        await sleep(delay);
      }
      attempt++;
    }
    throw lastErr instanceof Error ? lastErr : new NetworkError(PROVIDER);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function toAnthropicToolDef(spec: ToolSpec): { name: string; description: string; input_schema: unknown } {
  return { name: spec.name, description: spec.description, input_schema: spec.inputSchema };
}

function toStopReason(raw: string): StopReason {
  if (raw === 'tool_use') return 'tool_use';
  if (raw === 'max_tokens') return 'max_tokens';
  return 'end_turn';
}

function requestIdFromHeaders(res: Response): string | undefined {
  return res.headers.get('request-id') ?? res.headers.get('x-request-id') ?? undefined;
}

async function handleErrorResponse(res: Response): Promise<never> {
  const requestId = requestIdFromHeaders(res);
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(PROVIDER, extractMessage(bodyText) ?? 'Unauthorized.', requestId);
  }
  if (res.status === 429) {
    const retryAfter = parseRetryAfterMs(res.headers.get('retry-after'));
    throw new ProviderRateLimitError(PROVIDER, retryAfter, requestId);
  }
  if (res.status >= 500 && res.status < 600) {
    throw new NetworkError(PROVIDER, `HTTP ${res.status}: ${bodyText.slice(0, 200)}`, requestId);
  }
  if (res.status === 400) {
    const msg = extractMessage(bodyText) ?? `HTTP 400: ${bodyText.slice(0, 200)}`;
    throw new NetworkError(PROVIDER, msg, requestId);
  }
  throw new NetworkError(PROVIDER, `HTTP ${res.status}: ${bodyText.slice(0, 200)}`, requestId);
}

function extractMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return 1000;
  const s = Number(header);
  if (Number.isFinite(s) && s >= 0) return Math.floor(s * 1000);
  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) resolve();
    else setTimeout(resolve, ms);
  });
}
