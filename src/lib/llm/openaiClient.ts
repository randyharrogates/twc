import { AuthError } from './errors';
import { OpenAICompatClient, type OpenAICompatClientOptions } from './openaiCompatClient';

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const PROVIDER = 'openai';

export interface OpenAIClientOptions {
  apiKey: string;
  maxTokens?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

// Preset around `OpenAICompatClient` for the public OpenAI endpoint. The api key is
// required (unlike the local preset, which can run keyless). All transport / error /
// streaming behaviour lives in `openaiCompatClient.ts` — keep this thin.
export class OpenAIClient extends OpenAICompatClient {
  constructor(opts: OpenAIClientOptions) {
    if (!opts.apiKey) throw new AuthError(PROVIDER, 'apiKey is required.');
    const compat: OpenAICompatClientOptions = {
      baseUrl: OPENAI_ENDPOINT,
      apiKey: opts.apiKey,
      providerLabel: PROVIDER,
      maxTokens: opts.maxTokens,
      maxRetries: opts.maxRetries,
      baseDelayMs: opts.baseDelayMs,
      fetchImpl: opts.fetchImpl,
    };
    super(compat);
  }
}
