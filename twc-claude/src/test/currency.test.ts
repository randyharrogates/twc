import { describe, expect, it } from 'vitest';
import {
  CURRENCY_CODES,
  convertMinor,
  formatMinor,
  isCurrencyCode,
  minorDecimals,
  parseAmountToMinor,
} from '../lib/currency';

describe('CURRENCY_CODES', () => {
  it('exposes exactly the nine supported codes', () => {
    expect([...CURRENCY_CODES].sort()).toEqual([
      'EUR', 'GBP', 'JPY', 'KRW', 'MYR', 'SGD', 'THB', 'TWD', 'USD',
    ]);
  });
});

describe('minorDecimals', () => {
  it('returns 0 for JPY, KRW, TWD', () => {
    expect(minorDecimals('JPY')).toBe(0);
    expect(minorDecimals('KRW')).toBe(0);
    expect(minorDecimals('TWD')).toBe(0);
  });

  it('returns 2 for USD, SGD, MYR, EUR, GBP, THB', () => {
    for (const c of ['USD', 'SGD', 'MYR', 'EUR', 'GBP', 'THB'] as const) {
      expect(minorDecimals(c)).toBe(2);
    }
  });
});

describe('isCurrencyCode', () => {
  it('accepts supported codes and rejects others', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('JPY')).toBe(true);
    expect(isCurrencyCode('CNY')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
  });
});

describe('parseAmountToMinor', () => {
  it('parses 2-decimal currencies to cents', () => {
    expect(parseAmountToMinor('12.34', 'USD')).toBe(1234);
    expect(parseAmountToMinor('0.01', 'USD')).toBe(1);
    expect(parseAmountToMinor('1', 'USD')).toBe(100);
  });

  it('parses 0-decimal currencies as whole units', () => {
    expect(parseAmountToMinor('6000', 'JPY')).toBe(6000);
    expect(parseAmountToMinor('100', 'KRW')).toBe(100);
    expect(parseAmountToMinor('6000.4', 'JPY')).toBe(6000);
    expect(parseAmountToMinor('6000.6', 'JPY')).toBe(6001);
  });

  it('strips thousands commas', () => {
    expect(parseAmountToMinor('1,234.56', 'USD')).toBe(123456);
    expect(parseAmountToMinor('1,000,000', 'JPY')).toBe(1_000_000);
  });

  it('rejects non-numeric or empty input', () => {
    expect(parseAmountToMinor('abc', 'USD')).toBeNull();
    expect(parseAmountToMinor('', 'USD')).toBeNull();
    expect(parseAmountToMinor('  ', 'USD')).toBeNull();
  });
});

describe('formatMinor', () => {
  it('formats USD with two decimals and the $ symbol', () => {
    expect(formatMinor(1234, 'USD')).toBe('$12.34');
    expect(formatMinor(100, 'USD')).toBe('$1.00');
  });

  it('formats JPY as a comma-grouped integer with ¥', () => {
    expect(formatMinor(6000, 'JPY')).toBe('¥6,000');
    expect(formatMinor(1_234_567, 'JPY')).toBe('¥1,234,567');
  });

  it('prefixes minus before the symbol for negative amounts', () => {
    expect(formatMinor(-500, 'USD')).toBe('-$5.00');
    expect(formatMinor(-100, 'JPY')).toBe('-¥100');
  });
});

describe('convertMinor', () => {
  it('returns identity when from equals to, regardless of rate', () => {
    expect(convertMinor(1234, 'USD', 'USD', 999)).toBe(1234);
    expect(convertMinor(0, 'JPY', 'JPY', 0)).toBe(0);
  });

  it('converts 2-dec → 0-dec (USD to JPY)', () => {
    expect(convertMinor(3000, 'USD', 'JPY', 150)).toBe(4500);
  });

  it('converts 0-dec → 2-dec (JPY to USD)', () => {
    expect(convertMinor(6000, 'JPY', 'USD', 0.0066)).toBe(3960);
  });

  it('rounds to the nearest minor unit of the target currency', () => {
    expect(convertMinor(1, 'JPY', 'USD', 0.0067)).toBe(1);
    expect(convertMinor(1, 'JPY', 'USD', 0.0044)).toBe(0);
  });

  it('converts between two 0-decimal currencies', () => {
    expect(convertMinor(10_000, 'KRW', 'JPY', 0.1)).toBe(1000);
  });

  it('converts between two 2-decimal currencies', () => {
    expect(convertMinor(1000, 'GBP', 'USD', 1.27)).toBe(1270);
  });
});
