import { type OpenAIMessage } from './conversation';
import { AuthError, NetworkError, ProviderRateLimitError, TruncationError } from './errors';
import { getModel, isReasoningModel } from './models';
import { iterateSse } from './streaming';
import type {
  AgentClient,
  AgentMessage,
  AgentTurnRequest,
  AssistantResponseBlock,
  AssistantTurnResult,
  StopReason,
} from './agent';
import type { ToolSpec } from './tools/registry';
import type { SendOptions, TokenUsage } from './types';

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const PROVIDER = 'openai';

export interface OpenAIClientOptions {
  apiKey: string;
  maxTokens?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

interface OpenAIStreamEvent {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIClient implements AgentClient {
  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIClientOptions) {
    if (!opts.apiKey) throw new AuthError(PROVIDER, 'apiKey is required.');
    this.apiKey = opts.apiKey;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async sendTurn(req: AgentTurnRequest, opts?: SendOptions): Promise<AssistantTurnResult> {
    const openaiMessages = agentMessagesToOpenAI(req.system, req.messages);
    const cap = getModel(req.model).maxOutputTokens;
    const initial = req.maxTokens ?? this.maxTokens;
    let budget = Math.min(initial, cap);
    const reasoning = isReasoningModel(req.model);
    for (;;) {
      // Reasoning-model branch: swap max_tokens → max_completion_tokens and
      // emit reasoning_effort. Matches claw-code/rust/crates/api/src/providers/
      // openai_compat.rs:899-923 (skip temperature/top_p, emit reasoning_effort).
      const body: Record<string, unknown> = {
        model: req.model,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true },
        tools: req.tools.map(toOpenAIToolDef),
        tool_choice: 'auto',
      };
      if (reasoning) {
        body.max_completion_tokens = budget;
        const effort = req.reasoningEffort ?? 'minimal';
        body.reasoning_effort = effort === 'off' ? 'minimal' : effort;
      } else {
        body.max_tokens = budget;
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
    let accumulatedText = '';
    let lastReportedText: string | null = null;
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let rawFinishReason: string | null = null;
    interface ToolCallAcc { id: string; name: string; args: string; order: number }
    const toolCalls = new Map<number, ToolCallAcc>();
    let orderCounter = 0;

    for await (const ev of iterateSse(response)) {
      let parsed: OpenAIStreamEvent;
      try {
        parsed = JSON.parse(ev.data) as OpenAIStreamEvent;
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      const delta = choice?.delta as
        | {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          }
        | undefined;
      if (typeof delta?.content === 'string' && delta.content.length > 0) {
        accumulatedText += delta.content;
        if (opts?.onPartialText && accumulatedText !== lastReportedText) {
          lastReportedText = accumulatedText;
          opts.onPartialText(accumulatedText);
        }
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          let entry = toolCalls.get(index);
          const hadName = entry ? entry.name.length > 0 : false;
          if (!entry) {
            entry = {
              id: tc.id ?? `call_${index}`,
              name: tc.function?.name ?? '',
              args: '',
              order: orderCounter++,
            };
            toolCalls.set(index, entry);
          }
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (!hadName && entry.name.length > 0) {
            opts?.onPhase?.({ kind: 'calling_tool', name: entry.name });
          }
          if (typeof tc.function?.arguments === 'string') entry.args += tc.function.arguments;
        }
      }
      if (choice?.finish_reason) rawFinishReason = choice.finish_reason;
      if (parsed.usage) {
        usage = {
          inputTokens: parsed.usage.prompt_tokens ?? usage.inputTokens,
          outputTokens: parsed.usage.completion_tokens ?? usage.outputTokens,
        };
      }
    }

    const blocks: AssistantResponseBlock[] = [];
    if (accumulatedText.length > 0) blocks.push({ type: 'text', text: accumulatedText });
    const orderedToolCalls = Array.from(toolCalls.values()).sort((a, b) => a.order - b.order);
    for (const tc of orderedToolCalls) {
      let input: unknown = {};
      if (tc.args.trim().length > 0) {
        try {
          input = JSON.parse(tc.args);
        } catch {
          input = {};
        }
      }
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
    }

    const stopReason: StopReason =
      rawFinishReason === 'tool_calls'
        ? 'tool_use'
        : rawFinishReason === 'length'
          ? 'max_tokens'
          : 'end_turn';
    return { blocks, usage, stopReason, requestId };
  }

  private async fetchWithRetry(body: unknown, signal?: AbortSignal): Promise<Response> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const res = await this.fetchImpl(OPENAI_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
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

function toOpenAIToolDef(spec: ToolSpec): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: { name: spec.name, description: spec.description, parameters: spec.inputSchema },
  };
}

function agentMessagesToOpenAI(system: string, messages: AgentMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const parts: Array<{ type: 'text'; text: string }> = [];
      const toolCalls: NonNullable<OpenAIMessage['tool_calls']> = [];
      for (const b of m.blocks) {
        if (b.type === 'text') parts.push({ type: 'text', text: b.text });
        else if (b.type === 'tool_use') {
          toolCalls.push({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          });
        }
      }
      const msg: OpenAIMessage = {
        role: 'assistant',
        content: parts.length > 0 ? parts.map((p) => p.text).join('\n') : null,
      };
      if (toolCalls.length > 0) msg.tool_calls = toolCalls;
      out.push(msg);
    } else {
      const normalParts: Array<{ type: 'text' | 'image_url'; [k: string]: unknown }> = [];
      for (const b of m.blocks) {
        if (b.type === 'tool_result') {
          const text = b.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('\n');
          out.push({ role: 'tool', tool_call_id: b.toolUseId, content: text });
        } else if (b.type === 'text') {
          normalParts.push({ type: 'text', text: b.text });
        } else if (b.type === 'image') {
          normalParts.push({
            type: 'image_url',
            image_url: { url: `data:${b.mediaType};base64,${b.base64}`, detail: 'high' },
          });
        }
      }
      if (normalParts.length > 0) {
        const onlyText = normalParts.every((p) => p.type === 'text');
        out.push({
          role: 'user',
          content: onlyText
            ? normalParts.map((p) => (p as unknown as { text: string }).text).join('\n')
            : (normalParts as unknown as OpenAIMessage['content']),
        });
      }
    }
  }
  return out;
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
