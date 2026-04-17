import type { CurrencyCode, Member, SplitEntry, SplitMode } from '../../types';

export interface ExpenseDraft {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  splitMode: SplitMode;
  split: SplitEntry[];
  unresolvedNames?: string[];
}

export interface ParseContext {
  members: Member[];
  baseCurrency: CurrencyCode;
  rateHints: Partial<Record<CurrencyCode, number>>;
}

export type ParseResult =
  | { drafts: ExpenseDraft[] }
  | { parseError: string };

export interface LLMClient {
  parseExpenses(input: string, context: ParseContext): Promise<ParseResult>;
}
