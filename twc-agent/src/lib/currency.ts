export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  minorDecimals: 0 | 2;
}

export const CURRENCIES = {
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', minorDecimals: 2 },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', minorDecimals: 2 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', minorDecimals: 2 },
  KRW: { code: 'KRW', name: 'Korean Won', symbol: '₩', minorDecimals: 0 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorDecimals: 0 },
  TWD: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', minorDecimals: 0 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', minorDecimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', minorDecimals: 2 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', minorDecimals: 2 },
} as const satisfies Record<string, CurrencyMeta>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function minorDecimals(code: CurrencyCode): number {
  return CURRENCIES[code].minorDecimals;
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function parseAmountToMinor(input: string, code: CurrencyCode): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** minorDecimals(code);
  return Math.round(n * factor);
}

export function formatMinor(amountMinor: number, code: CurrencyCode): string {
  const { symbol, minorDecimals: dec } = CURRENCIES[code];
  const factor = 10 ** dec;
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const major = abs / factor;
  const formatted = major.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${sign}${symbol}${formatted}`;
}

export function convertMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: number,
): number {
  if (from === to) return amountMinor;
  const srcFactor = 10 ** minorDecimals(from);
  const dstFactor = 10 ** minorDecimals(to);
  return Math.round((amountMinor / srcFactor) * rate * dstFactor);
}
