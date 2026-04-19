import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicClient, ANTHROPIC_ENDPOINT, ANTHROPIC_VERSION } from '../../lib/llm/anthropicClient';
import {
  AuthError,
  NetworkError,
  ProviderRateLimitError,
  TruncationError,
} from '../../lib/llm/errors';
import type { AgentTurnRequest } from '../../lib/llm/agent';

function sseResponse(events: string[], extraHeaders: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of events) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...extraHeaders },
  });
}

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function turnStream(opts: {
  textParts?: string[];
  toolUses?: Array<{ id: string; name: string; inputJson: string }>;
  stopReason: string;
  usage?: { input_tokens: number; output_tokens: number };
}): Response {
  const usage = opts.usage ?? { input_tokens: 60, output_tokens: 25 };
  const events: string[] = [];
  events.push(
    sseLine('message_start', {
      message: { id: 'msg_t', usage: { input_tokens: usage.input_tokens, output_tokens: 0 } },
    }),
  );
  let index = 0;
  if (opts.textParts) {
    events.push(sseLine('content_block_start', { index, content_block: { type: 'text', text: '' } }));
    for (const p of opts.textParts) {
      events.push(sseLine('content_block_delta', { index, delta: { type: 'text_delta', text: p } }));
    }
    events.push(sseLine('content_block_stop', { index }));
    index++;
  }
  for (const tu of opts.toolUses ?? []) {
    events.push(
      sseLine('content_block_start', {
        index,
        content_block: { type: 'tool_use', id: tu.id, name: tu.name, input: {} },
      }),
    );
    events.push(
      sseLine('content_block_delta', {
        index,
        delta: { type: 'input_json_delta', partial_json: tu.inputJson },
      }),
    );
    events.push(sseLine('content_block_stop', { index }));
    index++;
  }
  events.push(
    sseLine('message_delta', {
      delta: { stop_reason: opts.stopReason },
      usage: { output_tokens: usage.output_tokens },
    }),
  );
  events.push(sseLine('message_stop', {}));
  return sseResponse(events);
}

function turnReq(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    system: 'sys',
    messages: [{ role: 'user', blocks: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    model: 'claude-haiku-4-5',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnthropicClient — sendTurn (agentic)', () => {
  it('returns text and tool_use blocks with stopReason=tool_use', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({
        textParts: ['Looking up members…'],
        toolUses: [{ id: 'tu1', name: 'resolve_name', inputJson: '{"query":"Marcus"}' }],
        stopReason: 'tool_use',
      }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(
      turnReq({
        messages: [{ role: 'user', blocks: [{ type: 'text', text: 'find marcus' }] }],
        tools: [
          { name: 'resolve_name', description: 'x', inputSchema: { type: 'object', additionalProperties: false }, mutating: false },
        ],
      }),
    );
    expect(res.stopReason).toBe('tool_use');
    expect(res.blocks).toHaveLength(2);
    expect(res.blocks[0]).toMatchObject({ type: 'text', text: 'Looking up members…' });
    expect(res.blocks[1]).toMatchObject({ type: 'tool_use', id: 'tu1', name: 'resolve_name' });
    expect((res.blocks[1] as { input: unknown }).input).toEqual({ query: 'Marcus' });
  });

  it('reports end_turn stopReason when the assistant stops with only text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['all done'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('end_turn');
    expect(res.blocks[0]).toMatchObject({ type: 'text', text: 'all done' });
  });

  it('sets tool_choice:auto and forwards the tool list in the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({
        tools: [
          { name: 'resolve_name', description: 'r', inputSchema: { type: 'object', additionalProperties: false }, mutating: false },
          { name: 'add_member', description: 'a', inputSchema: { type: 'object', additionalProperties: false }, mutating: true },
        ],
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      tool_choice: unknown;
      tools: Array<{ name: string }>;
    };
    expect(body.tool_choice).toBe('auto');
    expect(body.tools.map((t) => t.name)).toEqual(['resolve_name', 'add_member']);
  });

  it('encodes images as {type:image, source:{type:base64, media_type, data}}', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({
        messages: [
          {
            role: 'user',
            blocks: [
              { type: 'text', text: 'parse this' },
              { type: 'image', mediaType: 'image/jpeg', base64: 'ZZZ' },
            ],
          },
        ],
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const userMessage = body.messages[body.messages.length - 1];
    const imgBlock = userMessage.content.find((b) => b.type === 'image');
    expect(imgBlock).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'ZZZ' },
    });
  });

  it('requests a stream and reports partial assistantText via onPartialText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['Hello ', 'there'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const partials: string[] = [];
    await client.sendTurn(turnReq(), { onPartialText: (t) => partials.push(t) });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { stream: boolean };
    expect(body.stream).toBe(true);
    expect(partials.length).toBeGreaterThan(0);
    expect(partials[partials.length - 1]).toBe('Hello there');
  });

  it('sendTurn quadruples max_tokens on stop_reason:max_tokens and succeeds when the retry fits', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        turnStream({ textParts: ['partial…'], stopReason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 1024 } }),
      )
      .mockResolvedValueOnce(
        turnStream({ textParts: ['recovered'], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } }),
      );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
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
        turnStream({ textParts: ['partial'], stopReason: 'max_tokens', usage: { input_tokens: 5, output_tokens: 1024 } }),
      ),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(TruncationError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const caps = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(c[1].body as string) as { max_tokens: number }).max_tokens,
    );
    expect(caps).toEqual([1024, 4096, 16_384, 64_000]);
  });
});

describe('AnthropicClient — extended thinking', () => {
  it('includes thinking:{type:enabled, budget_tokens:4096} when reasoningEffort=low', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({ model: 'claude-sonnet-4-6', reasoningEffort: 'low' }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
  });

  it('omits the thinking key entirely when reasoningEffort is off', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(
      turnReq({ model: 'claude-sonnet-4-6', reasoningEffort: 'off' }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.thinking).toBeUndefined();
  });

  it('maps each reasoningEffort value to its documented thinking budget', async () => {
    const cases: Array<[Exclude<NonNullable<AgentTurnRequest['reasoningEffort']>, 'off'>, number]> = [
      ['minimal', 1024],
      ['low', 4096],
      ['medium', 16_000],
      ['high', 32_000],
    ];
    for (const [effort, expected] of cases) {
      const fetchImpl = vi.fn().mockResolvedValue(
        turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
      );
      const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
      await client.sendTurn(
        turnReq({ model: 'claude-sonnet-4-6', reasoningEffort: effort }),
      );
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
        thinking: { budget_tokens: number };
      };
      expect(body.thinking.budget_tokens).toBe(expected);
    }
  });

  it('fires onPhase:calling_tool when a content_block_start tool_use event arrives', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({
        toolUses: [{ id: 'tu1', name: 'resolve_name', inputJson: '{"query":"Marcus"}' }],
        stopReason: 'tool_use',
      }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    const phases: Array<{ kind: string; name?: string }> = [];
    await client.sendTurn(turnReq(), {
      onPhase: (p) => phases.push(p as { kind: string; name?: string }),
    });
    const toolPhases = phases.filter((p) => p.kind === 'calling_tool');
    expect(toolPhases).toHaveLength(1);
    expect(toolPhases[0].name).toBe('resolve_name');
  });
});

describe('AnthropicClient — error taxonomy', () => {
  it('throws AuthError on HTTP 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(AuthError);
  });

  it('throws ProviderRateLimitError on HTTP 429 with retryAfter from header', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '7' } }));
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderRateLimitError);
      if (err instanceof ProviderRateLimitError) expect(err.retryAfterMs).toBe(7000);
    }
  });

  it('retries on 500 and eventually throws NetworkError after maxRetries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('upstream down', { status: 500 }));
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 2, baseDelayMs: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws NetworkError on HTTP 400 with the body error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad request shape' } }), { status: 400 }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      if (err instanceof NetworkError) expect(err.message).toMatch(/bad request shape/);
    }
  });
});

describe('AnthropicClient — headers and key handling', () => {
  it('sends x-api-key, anthropic-version, and anthropic-dangerous-direct-browser-access headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'sk-ant-test', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe(ANTHROPIC_ENDPOINT);
    const headers = call[1].headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('throws at construction time when apiKey is empty', () => {
    expect(() => new AnthropicClient({ apiKey: '' })).toThrow(AuthError);
  });

  it('never includes the API key in the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({ textParts: ['ok'], stopReason: 'end_turn' }),
    );
    const client = new AnthropicClient({ apiKey: 'sk-ant-secret', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const bodyStr = fetchImpl.mock.calls[0][1].body as string;
    expect(bodyStr).not.toContain('sk-ant-secret');
  });
});

describe('AnthropicClient — request ID propagation', () => {
  it('attaches request-id from the 401 response to AuthError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'request-id': 'req-xyz' },
      }),
    );
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      if (err instanceof AuthError) expect(err.requestId).toBe('req-xyz');
    }
  });
});

describe('AnthropicClient — abort behavior', () => {
  it('aborts the request when the AbortSignal fires', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
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
            sseLine('message_start', { message: { id: 'm', usage: { input_tokens: 5, output_tokens: 0 } } }),
          ),
        );
        streamController.enqueue(
          encoder.encode(
            sseLine('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
          ),
        );
        streamController.enqueue(
          encoder.encode(
            sseLine('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'he' } }),
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
    const client = new AnthropicClient({ apiKey: 'k', fetchImpl, maxRetries: 0 });
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
