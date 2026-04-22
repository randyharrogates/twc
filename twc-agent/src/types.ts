import type { CurrencyCode } from './lib/currency';

export type { CurrencyCode } from './lib/currency';

export type SplitMode = 'even' | 'shares' | 'exact' | 'percent';

export interface Member {
  id: string;
  name: string;
}

export interface SplitEntry {
  memberId: string;
  value: number;
}

export interface Expense {
  id: string;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  splitMode: SplitMode;
  split: SplitEntry[];
  createdAt: number;
  receiptRef?: string;
}

export interface Group {
  id: string;
  version: number;
  name: string;
  baseCurrency: CurrencyCode;
  createdAt: number;
  members: Member[];
  expenses: Expense[];
  rateHints: Partial<Record<CurrencyCode, number>>;
  settlement?: Transfer[];
  settledAt?: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountMinor: number;
}
