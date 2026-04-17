import { describe, expect, it } from 'vitest';
import { distributeProportional, sumMinor } from '../lib/money';

describe('distributeProportional', () => {
  it('evenly splits a total with no remainder', () => {
    expect(distributeProportional(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it('distributes a single-unit remainder to the first entry (tied fractions broken by index)', () => {
    const out = distributeProportional(1000, [1, 1, 1]);
    expect(sumMinor(out)).toBe(1000);
    expect(out).toEqual([334, 333, 333]);
  });

  it('distributes a two-unit remainder to the two largest fractions', () => {
    const out = distributeProportional(1001, [1, 1, 1]);
    expect(sumMinor(out)).toBe(1001);
    expect(out).toEqual([334, 334, 333]);
  });

  it('respects weighted splits with remainder going to the larger fraction', () => {
    const out = distributeProportional(1000, [2, 1]);
    expect(sumMinor(out)).toBe(1000);
    expect(out).toEqual([667, 333]);
  });

  it('gives zero to zero-weight entries', () => {
    const out = distributeProportional(1000, [1, 0, 1]);
    expect(sumMinor(out)).toBe(1000);
    expect(out[1]).toBe(0);
    expect(out[0] + out[2]).toBe(1000);
  });

  it('returns all zeros when all weights are zero', () => {
    expect(distributeProportional(1000, [0, 0])).toEqual([0, 0]);
  });

  it('handles large totals with many participants and preserves the sum', () => {
    const weights = Array.from({ length: 17 }, () => 1);
    const total = 123_456_789;
    const out = distributeProportional(total, weights);
    expect(sumMinor(out)).toBe(total);
  });

  it('rejects non-integer totals', () => {
    expect(() => distributeProportional(100.5, [1])).toThrow();
  });

  it('rejects negative totals', () => {
    expect(() => distributeProportional(-1, [1])).toThrow();
  });

  it('rejects negative weights', () => {
    expect(() => distributeProportional(100, [1, -1])).toThrow();
  });
});
