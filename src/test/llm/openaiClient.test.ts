import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIClient, OPENAI_ENDPOINT } from '../../lib/llm/openaiClient';
import {
  AuthError,
  NetworkError,
  ProviderRateLimitError,
  TruncationError,
} from '../../lib/llm/errors';
import type { AgentTurnRequest } from '../../lib/llm/agent';

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of events) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function turnStream(opts: {
  content?: string;
  toolCalls?: Array<{ index: number; id: string; name: string; arguments: string }>;
  finishReason: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}): Response {
  const usage = opts.usage ?? { prompt_tokens: 30, completion_tokens: 12 };
  const chunks: string[] = [];
  if (opts.content) {
    chunks.push(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: opts.content }, finish_reason: null }] })}\n\n`,
    );
  }
  if (opts.toolCalls) {
    for (const tc of opts.toolCalls) {
      chunks.push(
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: tc.index, id: tc.id, type: 'function', function: { name: tc.name, arguments: '' } },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      );
      chunks.push(
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: tc.index, function: { arguments: tc.arguments } }],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      );
    }
  }
  chunks.push(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: opts.finishReason }], usage })}\n\n`,
  );
  chunks.push('data: [DONE]\n\n');
  return sseResponse(chunks);
}

function turnReq(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    system: 'sys',
    messages: [{ role: 'user', blocks: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    model: 'gpt-4.1-mini',
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('OpenAIClient — sendTurn (agentic)', () => {
  it('maps finish_reason=tool_calls to stopReason=tool_use and returns tool_use blocks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({
        content: 'Looking up…',
        toolCalls: [{ index: 0, id: 'call_1', name: 'resolve_name', arguments: '{"query":"Marcus"}' }],
        finishReason: 'tool_calls',
      }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(
      turnReq({
        messages: [{ role: 'user', blocks: [{ type: 'text', text: 'find marcus' }] }],
        tools: [
          { name: 'resolve_name', description: 'r', inputSchema: { type: 'object', additionalProperties: false }, mutating: false },
        ],
      }),
    );
    expect(res.stopReason).toBe('tool_use');
    expect(res.blocks).toHaveLength(2);
    expect(res.blocks[0]).toMatchObject({ type: 'text', text: 'Looking up…' });
    expect(res.blocks[1]).toMatchObject({ type: 'tool_use', id: 'call_1', name: 'resolve_name' });
    expect((res.blocks[1] as { input: unknown }).input).toEqual({ query: 'Marcus' });
  });

  it('maps finish_reason=stop to stopReason=end_turn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'all done', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('end_turn');
  });

  it('sends tool_choice:auto and forwards the tool list as function definitions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({
        tools: [
          { name: 'resolve_name', description: 'r', inputSchema: { type: 'object', additionalProperties: false }, mutating: false },
        ],
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      tool_choice: unknown;
      tools: Array<{ type: string; function: { name: string } }>;
    };
    expect(body.tool_choice).toBe('auto');
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('resolve_name');
  });

  it('encodes images as image_url with a data-URI and detail: high', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({
        messages: [
          {
            role: 'user',
            blocks: [
              { type: 'text', text: 'parse' },
              { type: 'image', mediaType: 'image/png', base64: 'ZZZ' },
            ],
          },
        ],
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      messages: Array<{ content: unknown }>;
    };
    const user = body.messages[body.messages.length - 1];
    const parts = user.content as Array<Record<string, unknown>>;
    const img = parts.find((p) => p.type === 'image_url');
    expect(img).toBeDefined();
    const urlPart = (img as { image_url: { url: string; detail: string } }).image_url;
    expect(urlPart.url).toBe('data:image/png;base64,ZZZ');
    expect(urlPart.detail).toBe('high');
  });

  it('requests a stream with include_usage and reports partial text via onPartialText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'Hello there', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const partials: string[] = [];
    await client.sendTurn(turnReq(), { onPartialText: (t) => partials.push(t) });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      stream: boolean;
      stream_options: { include_usage: boolean };
    };
    expect(body.stream).toBe(true);
    expect(body.stream_options.include_usage).toBe(true);
    expect(partials.length).toBeGreaterThan(0);
    expect(partials[partials.length - 1]).toBe('Hello there');
  });

  it('sendTurn quadruples max_tokens on finish_reason=length and succeeds when the retry fits', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        turnStream({ content: 'partial', finishReason: 'length', usage: { prompt_tokens: 5, completion_tokens: 1024 } }),
      )
      .mockResolvedValueOnce(
        turnStream({ content: 'recovered', finishReason: 'stop', usage: { prompt_tokens: 5, completion_tokens: 20 } }),
      );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('end_turn');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const caps = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(c[1].body as string) as { max_tokens: number }).max_tokens,
    );
    expect(caps).toEqual([1024, 4096]);
  });

  it('sendTurn throws TruncationError at the model cap after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        turnStream({ content: 'partial', finishReason: 'length', usage: { prompt_tokens: 5, completion_tokens: 1024 } }),
      ),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(TruncationError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const caps = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(c[1].body as string) as { max_tokens: number }).max_tokens,
    );
    expect(caps).toEqual([1024, 4096, 16_384, 32_768]);
  });
});

describe('OpenAIClient — reasoning models (GPT-5 family)', () => {
  it('sends max_completion_tokens + reasoning_effort for gpt-5-mini and omits max_tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({ model: 'gpt-5-mini', reasoningEffort: 'medium' }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_completion_tokens).toBeTypeOf('number');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it('falls back to reasoning_effort=minimal when effort is off on a reasoning model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq({ model: 'gpt-5', reasoningEffort: 'off' }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('minimal');
  });

  it('defaults reasoning_effort to minimal when not supplied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq({ model: 'gpt-5-mini' }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('minimal');
  });

  it('non-reasoning models still use max_tokens and never emit reasoning_effort', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq({ model: 'gpt-4.1-mini', reasoningEffort: 'medium' }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBeTypeOf('number');
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('fires onPhase with calling_tool:<name> when a streamed tool_call first reveals its name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({
        toolCalls: [{ index: 0, id: 'call_1', name: 'resolve_name', arguments: '{"query":"Marcus"}' }],
        finishReason: 'tool_calls',
      }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const phases: Array<{ kind: string; name?: string }> = [];
    await client.sendTurn(turnReq(), {
      onPhase: (p) => phases.push(p as { kind: string; name?: string }),
    });
    const toolPhases = phases.filter((p) => p.kind === 'calling_tool');
    expect(toolPhases).toHaveLength(1);
    expect(toolPhases[0].name).toBe('resolve_name');
  });
});

describe('OpenAIClient — error taxonomy', () => {
  it('throws AuthError on HTTP 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(AuthError);
  });

  it('throws ProviderRateLimitError on HTTP 429', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '3' } }));
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderRateLimitError);
      if (err instanceof ProviderRateLimitError) expect(err.retryAfterMs).toBe(3000);
    }
  });

  it('retries on 500 then throws NetworkError after maxRetries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 2, baseDelayMs: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws NetworkError on HTTP 400 with the body error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad request shape' } }), { status: 400 }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      if (err instanceof NetworkError) expect(err.message).toMatch(/bad request shape/);
    }
  });
});

describe('OpenAIClient — headers and key handling', () => {
  it('sends Authorization Bearer and Content-Type headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'sk-openai', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe(OPENAI_ENDPOINT);
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-openai');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('throws at construction time when apiKey is empty', () => {
    expect(() => new OpenAIClient({ apiKey: '' })).toThrow(AuthError);
  });

  it('never includes the API key in the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ content: 'ok', finishReason: 'stop' }),
    );
    const client = new OpenAIClient({ apiKey: 'sk-openai-secret', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const bodyStr = fetchImpl.mock.calls[0][1].body as string;
    expect(bodyStr).not.toContain('sk-openai-secret');
  });
});

describe('OpenAIClient — request ID propagation', () => {
  it('attaches x-request-id from the 401 response to AuthError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'x-request-id': 'req-abc' },
      }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      if (err instanceof AuthError) expect(err.requestId).toBe('req-abc');
    }
  });
});

describe('OpenAIClient — abort behavior', () => {
  it('aborts the request when the AbortSignal fires', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const controller = new AbortController();
    const p = client.sendTurn(turnReq(), { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates AbortError when cancelled mid-stream (after first partial token)', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'he' }, finish_reason: null }] })}\n\n`,
          ),
        );
        const onAbort = () => {
          streamController.error(new DOMException('aborted', 'AbortError'));
        };
        controller.signal.addEventListener('abort', onAbort);
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    let sawPartial = false;
    const p = client.sendTurn(turnReq(), {
      signal: controller.signal,
      onPartialText: () => {
        sawPartial = true;
        controller.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawPartial).toBe(true);
  });
});
