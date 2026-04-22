import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatClient } from '../../lib/llm/openaiCompatClient';
import {
  AuthError,
  NetworkError,
  ProviderRateLimitError,
  TruncationError,
} from '../../lib/llm/errors';
import type { AgentTurnRequest } from '../../lib/llm/agent';

const COMPAT_URL = 'https://api.example.test/v1/chat/completions';

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

describe('OpenAICompatClient — agentic stream parsing', () => {
  it('maps finish_reason=tool_calls to stopReason=tool_use and returns tool_use blocks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      turnStream({
        content: 'Looking up…',
        toolCalls: [{ index: 0, id: 'call_1', name: 'resolve_name', arguments: '{"query":"Marcus"}' }],
        finishReason: 'tool_calls',
      }),
    );
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('tool_use');
    expect(res.blocks[1]).toMatchObject({ type: 'tool_use', name: 'resolve_name' });
    expect((res.blocks[1] as { input: unknown }).input).toEqual({ query: 'Marcus' });
  });

  it('maps finish_reason=stop to stopReason=end_turn', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'all done', finishReason: 'stop' }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('end_turn');
  });

  it('quadruples max_tokens on finish_reason=length and recovers when the retry fits', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        turnStream({ content: 'partial', finishReason: 'length', usage: { prompt_tokens: 5, completion_tokens: 1024 } }),
      )
      .mockResolvedValueOnce(
        turnStream({ content: 'recovered', finishReason: 'stop', usage: { prompt_tokens: 5, completion_tokens: 20 } }),
      );
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    const res = await client.sendTurn(turnReq());
    expect(res.stopReason).toBe('end_turn');
    const caps = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(c[1].body as string) as { max_tokens: number }).max_tokens,
    );
    expect(caps).toEqual([1024, 4096]);
  });

  it('throws TruncationError once the model cap is exhausted', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        turnStream({ content: 'partial', finishReason: 'length', usage: { prompt_tokens: 5, completion_tokens: 1024 } }),
      ),
    );
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(TruncationError);
  });
});

describe('OpenAICompatClient — model-name override (apiModelName)', () => {
  it('forwards req.model in body.model when apiModelName is omitted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'ok', finishReason: 'stop' }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq({ model: 'gpt-4.1-mini' }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { model: string };
    expect(body.model).toBe('gpt-4.1-mini');
  });

  it('overrides body.model with apiModelName while still using req.model for the cap lookup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'ok', finishReason: 'stop' }));
    const client = new OpenAICompatClient({
      baseUrl: COMPAT_URL,
      apiKey: 'k',
      apiModelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    // req.model = 'local' so getModel('local') is used for cap; body.model is the override.
    await client.sendTurn(turnReq({ model: 'local' }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { model: string };
    expect(body.model).toBe('qwen2.5-vl:7b');
  });
});

describe('OpenAICompatClient — auth header handling', () => {
  it('omits the Authorization header entirely when apiKey is blank', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'ok', finishReason: 'stop' }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: '', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends Authorization Bearer when an apiKey is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'ok', finishReason: 'stop' }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'sk-secret', fetchImpl, maxRetries: 0 });
    await client.sendTurn(turnReq());
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-secret');
  });

  it('never includes the API key in the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(turnStream({ content: 'ok', finishReason: 'stop' }));
    const client = new OpenAICompatClient({
      baseUrl: COMPAT_URL,
      apiKey: 'sk-secret-key-marker',
      fetchImpl,
      maxRetries: 0,
    });
    await client.sendTurn(turnReq());
    const bodyStr = fetchImpl.mock.calls[0][1].body as string;
    expect(bodyStr).not.toContain('sk-secret-key-marker');
  });
});

describe('OpenAICompatClient — error taxonomy', () => {
  it('throws AuthError on HTTP 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(AuthError);
  });

  it('throws ProviderRateLimitError on HTTP 429 with retry-after parsed to ms', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '3' } }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 0 });
    try {
      await client.sendTurn(turnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderRateLimitError);
      if (err instanceof ProviderRateLimitError) expect(err.retryAfterMs).toBe(3000);
    }
  });

  it('retries on 5xx then throws NetworkError after maxRetries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const client = new OpenAICompatClient({ baseUrl: COMPAT_URL, apiKey: 'k', fetchImpl, maxRetries: 2, baseDelayMs: 0 });
    await expect(client.sendTurn(turnReq())).rejects.toBeInstanceOf(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
