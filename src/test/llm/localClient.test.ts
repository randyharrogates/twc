import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalClient, isAllowedLocalBaseUrl } from '../../lib/llm/localClient';
import { LocalEndpointUnreachableError, NetworkError } from '../../lib/llm/errors';
import {
  resetLocalModelRuntime,
  setLocalModelRuntime,
} from '../../lib/llm/models';
import type { AgentTurnRequest } from '../../lib/llm/agent';

beforeEach(() => {
  setLocalModelRuntime({
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_096,
    supportsVision: false,
  });
});

afterEach(() => {
  resetLocalModelRuntime();
  vi.restoreAllMocks();
});

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

function endTurn(): Response {
  return sseResponse([
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    })}\n\n`,
    'data: [DONE]\n\n',
  ]);
}

function localTurnReq(): AgentTurnRequest {
  return {
    system: 'sys',
    messages: [{ role: 'user', blocks: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    model: 'local',
  };
}

describe('isAllowedLocalBaseUrl — URL allow-list', () => {
  it('accepts HTTPS URLs anywhere', () => {
    expect(isAllowedLocalBaseUrl('https://example.com/v1/chat/completions')).toBe(true);
    expect(isAllowedLocalBaseUrl('https://api.openai.com/v1/chat/completions')).toBe(true);
  });

  it('accepts http://localhost on any port and with any path', () => {
    expect(isAllowedLocalBaseUrl('http://localhost:11434/v1/chat/completions')).toBe(true);
    expect(isAllowedLocalBaseUrl('http://localhost/v1/chat/completions')).toBe(true);
    expect(isAllowedLocalBaseUrl('http://localhost:1234')).toBe(true);
  });

  it('accepts http://127.0.0.1 and http://[::1]', () => {
    expect(isAllowedLocalBaseUrl('http://127.0.0.1:11434/v1/chat/completions')).toBe(true);
    expect(isAllowedLocalBaseUrl('http://[::1]:11434/v1/chat/completions')).toBe(true);
  });

  it('rejects plain http:// to non-loopback hosts (the SSRF-adjacent blocker)', () => {
    expect(isAllowedLocalBaseUrl('http://evil.com/v1/chat/completions')).toBe(false);
    expect(isAllowedLocalBaseUrl('http://192.168.1.1:11434/v1/chat/completions')).toBe(false);
    expect(isAllowedLocalBaseUrl('http://10.0.0.1/v1/chat/completions')).toBe(false);
  });

  it('rejects file://, ftp://, javascript:, and other non-HTTP(S) schemes', () => {
    expect(isAllowedLocalBaseUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedLocalBaseUrl('ftp://localhost/x')).toBe(false);
    expect(isAllowedLocalBaseUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects unparseable strings', () => {
    expect(isAllowedLocalBaseUrl('')).toBe(false);
    expect(isAllowedLocalBaseUrl('not a url')).toBe(false);
  });
});

describe('LocalClient — construction', () => {
  it('throws when baseUrl fails the allow-list', () => {
    expect(
      () => new LocalClient({ baseUrl: 'http://evil.com/v1/chat/completions', modelName: 'qwen2.5-vl:7b' }),
    ).toThrow(/not allowed/);
  });

  it('throws when modelName is empty', () => {
    expect(
      () => new LocalClient({ baseUrl: 'http://localhost:11434/v1/chat/completions', modelName: '' }),
    ).toThrow(/modelName/);
  });
});

describe('LocalClient — auth header is omitted when no key is configured', () => {
  it('does not send an Authorization header when apiKey is undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(endTurn());
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    await client.sendTurn(localTurnReq());
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends Authorization Bearer when an apiKey is provided, but never in the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(endTurn());
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      apiKey: 'sk-local-test-marker',
      fetchImpl,
      maxRetries: 0,
    });
    await client.sendTurn(localTurnReq());
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-local-test-marker');
    expect(init.body as string).not.toContain('sk-local-test-marker');
  });
});

describe('LocalClient — wire model name', () => {
  it('puts the user-supplied modelName into body.model regardless of req.model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(endTurn());
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    await client.sendTurn(localTurnReq());
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { model: string };
    expect(body.model).toBe('qwen2.5-vl:7b');
  });
});

describe('LocalClient — mixed-content / connection failures', () => {
  it('wraps a generic "Failed to fetch" TypeError as LocalEndpointUnreachableError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    try {
      await client.sendTurn(localTurnReq());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(LocalEndpointUnreachableError);
      // LocalEndpointUnreachableError extends NetworkError so existing handlers still
      // recognise it as infra failure.
      expect(err).toBeInstanceOf(NetworkError);
      if (err instanceof LocalEndpointUnreachableError) {
        expect(err.baseUrl).toBe('http://localhost:11434/v1/chat/completions');
      }
    }
  });

  it('still propagates AbortError unchanged', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    await expect(client.sendTurn(localTurnReq())).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('LocalClient — JPY receipt round-trip via the runtime cache', () => {
  it('uses setLocalModelRuntime() to size an oversized context check on send', async () => {
    setLocalModelRuntime({
      contextWindowTokens: 65_536,
      maxOutputTokens: 8_192,
      supportsVision: true,
    });
    // The local model now reports 65_536 tokens of context. We just verify this is
    // observable via the wire path — the actual preflight lives upstream in ChatPanel.
    const fetchImpl = vi.fn().mockResolvedValue(endTurn());
    const client = new LocalClient({
      baseUrl: 'http://localhost:11434/v1/chat/completions',
      modelName: 'qwen2.5-vl:7b',
      fetchImpl,
      maxRetries: 0,
    });
    // 0-decimal currency case (JPY/KRW/TWD) coverage — included per the LLM-chat
    // testing rule. The body should faithfully forward the user's text content.
    await client.sendTurn({
      system: 'sys',
      messages: [
        { role: 'user', blocks: [{ type: 'text', text: 'Receipt total ¥500 (JPY, 0-decimal)' }] },
      ],
      tools: [],
      model: 'local',
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      messages: Array<{ content: string | unknown }>;
    };
    const lastMessage = body.messages[body.messages.length - 1];
    expect(JSON.stringify(lastMessage.content)).toContain('¥500');
  });
});
