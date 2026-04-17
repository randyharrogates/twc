import { MockLLMClient } from './mockClient';
import type { LLMClient } from './types';

export type { LLMClient, ExpenseDraft, ParseContext, ParseResult } from './types';

export function createLLMClient(): LLMClient {
  return new MockLLMClient();
}
