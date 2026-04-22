export class AuthError extends Error {
  readonly requestId?: string;
  constructor(provider: string, message = 'Invalid or missing API key.', requestId?: string) {
    super(`${provider}: ${message}`);
    this.name = 'AuthError';
    this.requestId = requestId;
  }
}

export class NetworkError extends Error {
  readonly requestId?: string;
  constructor(provider: string, message = 'Network or upstream error.', requestId?: string) {
    super(`${provider}: ${message}`);
    this.name = 'NetworkError';
    this.requestId = requestId;
  }
}

// Mixed-content / DNS / connection-refused / browser-PNA-block surfaced as "Failed to
// fetch" — we cannot tell the failure modes apart from the browser, so collapse them
// into a named subtype that the UI can map to the README's Run-with-Ollama section.
export class LocalEndpointUnreachableError extends NetworkError {
  readonly baseUrl: string;
  constructor(baseUrl: string, message = 'Browser blocked the connection (mixed content or PNA).') {
    super('local', `${message} URL: ${baseUrl}`);
    this.name = 'LocalEndpointUnreachableError';
    this.baseUrl = baseUrl;
  }
}

export class ProviderRateLimitError extends Error {
  readonly retryAfterMs: number;
  readonly requestId?: string;
  constructor(provider: string, retryAfterMs: number, requestId?: string) {
    super(`${provider}: rate-limited; retry after ${retryAfterMs}ms.`);
    this.name = 'ProviderRateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.requestId = requestId;
  }
}

export class TruncationError extends Error {
  readonly requestId?: string;
  readonly maxTokens: number;
  constructor(provider: string, maxTokens: number, requestId?: string) {
    super(
      `${provider}: response hit model cap (${maxTokens} tokens). Split the request into fewer receipts per message.`,
    );
    this.name = 'TruncationError';
    this.maxTokens = maxTokens;
    this.requestId = requestId;
  }
}

export class VaultLockedError extends Error {
  constructor(message = 'API-key vault is locked. Unlock it in Settings → Security to send.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export function isInfraError(err: unknown): err is AuthError | NetworkError | ProviderRateLimitError {
  return err instanceof AuthError || err instanceof NetworkError || err instanceof ProviderRateLimitError;
}
