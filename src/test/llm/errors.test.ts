import { describe, expect, it } from 'vitest';
import {
  AuthError,
  NetworkError,
  ProviderRateLimitError,
  TruncationError,
  isInfraError,
} from '../../lib/llm/errors';

describe('LLM error taxonomy', () => {
  it('AuthError carries provider name in message and has name AuthError', () => {
    const e = new AuthError('anthropic');
    expect(e.name).toBe('AuthError');
    expect(e.message).toContain('anthropic');
    expect(e.message.toLowerCase()).toContain('api key');
  });

  it('NetworkError defaults to a generic upstream-error message', () => {
    const e = new NetworkError('openai');
    expect(e.name).toBe('NetworkError');
    expect(e.message).toContain('openai');
  });

  it('ProviderRateLimitError retains retryAfterMs verbatim', () => {
    const e = new ProviderRateLimitError('anthropic', 7500);
    expect(e.name).toBe('ProviderRateLimitError');
    expect(e.retryAfterMs).toBe(7500);
    expect(e.message).toContain('7500');
  });

  it('isInfraError is true for the three typed infra errors and false for plain Error', () => {
    expect(isInfraError(new AuthError('x'))).toBe(true);
    expect(isInfraError(new NetworkError('x'))).toBe(true);
    expect(isInfraError(new ProviderRateLimitError('x', 100))).toBe(true);
    expect(isInfraError(new Error('generic'))).toBe(false);
    expect(isInfraError({ message: 'not an error' })).toBe(false);
  });

  it('TruncationError carries the maxTokens cap and requestId, names itself TruncationError', () => {
    const e = new TruncationError('anthropic', 4096, 'req-1');
    expect(e.name).toBe('TruncationError');
    expect(e.maxTokens).toBe(4096);
    expect(e.requestId).toBe('req-1');
    expect(e.message).toContain('4096');
    expect(e.message.toLowerCase()).toContain('model cap');
  });

  it('TruncationError is not classified as an infra error (it is a content-shape error)', () => {
    expect(isInfraError(new TruncationError('openai', 4096))).toBe(false);
  });
});
