import { LocalEndpointUnreachableError, NetworkError } from './errors';
import { OpenAICompatClient } from './openaiCompatClient';
import type { AgentTurnRequest, AssistantTurnResult } from './agent';
import type { SendOptions } from './types';

export interface LocalClientOptions {
  baseUrl: string;
  modelName: string;
  apiKey?: string;
  maxTokens?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const PROVIDER = 'local';

// URL allow-list — the only mitigation against a malicious link / pasted value
// turning TWC into an SSRF-adjacent fetch source from the user's browser. Mirrored
// inline in SettingsDialog (Local section) for save-time validation; this re-check
// is the load-bearing guard so a code path that bypasses the dialog cannot reach
// arbitrary URLs.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedLocalBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

export class LocalClient extends OpenAICompatClient {
  constructor(opts: LocalClientOptions) {
    if (!opts.baseUrl) throw new Error(`${PROVIDER}: baseUrl is required.`);
    if (!opts.modelName) throw new Error(`${PROVIDER}: modelName is required.`);
    if (!isAllowedLocalBaseUrl(opts.baseUrl)) {
      throw new Error(
        `${PROVIDER}: baseUrl "${opts.baseUrl}" is not allowed. ` +
          'Only HTTPS URLs or http://localhost, http://127.0.0.1, http://[::1] may be used.',
      );
    }
    const wrappedFetch = wrapFetchForLocal(opts.fetchImpl ?? fetch.bind(globalThis), opts.baseUrl);
    super({
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      apiModelName: opts.modelName,
      providerLabel: PROVIDER,
      maxTokens: opts.maxTokens,
      maxRetries: opts.maxRetries,
      baseDelayMs: opts.baseDelayMs,
      fetchImpl: wrappedFetch,
    });
  }

  // Re-typed to keep the public surface identical to other clients; behaviour is
  // entirely inherited.
  override sendTurn(req: AgentTurnRequest, opts?: SendOptions): Promise<AssistantTurnResult> {
    return super.sendTurn(req, opts);
  }
}

// Browsers report mixed-content / DNS / refused connections / PNA preflight failures
// as a generic `TypeError: Failed to fetch`. Re-throw as `LocalEndpointUnreachableError`
// so the UI can surface the README's Run-with-Ollama section instead of a generic
// "network error" toast.
function wrapFetchForLocal(inner: typeof fetch, baseUrl: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await inner(input as RequestInfo, init);
    } catch (err) {
      // DOMException may not satisfy `instanceof Error` in every runtime; check name
      // first so an aborted local fetch surfaces as AbortError, not as the
      // mixed-content fallback.
      if (isAbortLike(err)) throw err;
      if (err instanceof NetworkError) throw err;
      throw new LocalEndpointUnreachableError(
        baseUrl,
        err instanceof Error ? err.message : 'Failed to fetch.',
      );
    }
  }) as typeof fetch;
}

function isAbortLike(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}
