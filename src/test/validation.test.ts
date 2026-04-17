import { describe, expect, it } from 'vitest';
import { validateAmountMinor, validateRate, validateSplit } from '../lib/validation';

describe('validateAmountMinor', () => {
  it('accepts positive integers', () => {
    expect(validateAmountMinor(1)).toBeNull();
    expect(validateAmountMinor(1_000_000)).toBeNull();
  });
  it('rejects zero, negatives, and fractionals', () => {
    expect(validateAmountMinor(0)).toMatch(/greater than zero/);
    expect(validateAmountMinor(-5)).toMatch(/greater than zero/);
    expect(validateAmountMinor(1.5)).toMatch(/whole number/);
  });
});

describe('validateRate', () => {
  it('skips validation when same currency', () => {
    expect(validateRate(0, true)).toBeNull();
    expect(validateRate(Number.NaN, true)).toBeNull();
  });
  it('rejects non-positive rates when currencies differ', () => {
    expect(validateRate(0, false)).toMatch(/positive/);
    expect(validateRate(-1, false)).toMatch(/positive/);
    expect(validateRate(Number.NaN, false)).toMatch(/positive/);
  });
  it('accepts positive rates when currencies differ', () => {
    expect(validateRate(0.0066, false)).toBeNull();
    expect(validateRate(150, false)).toBeNull();
  });
});

describe('validateSplit', () => {
  it('rejects empty splits', () => {
    expect(validateSplit('even', [], 1000)).toMatch(/No members/);
  });

  describe('even', () => {
    it('passes with at least one participant', () => {
      expect(validateSplit('even', [
        { memberId: 'a', value: 1 },
        { memberId: 'b', value: 0 },
      ], 1000)).toBeNull();
    });
    it('rejects when no one is selected', () => {
      expect(validateSplit('even', [{ memberId: 'a', value: 0 }], 1000))
        .toMatch(/at least one participant/i);
    });
  });

  describe('shares', () => {
    it('passes when total shares > 0', () => {
      expect(validateSplit('shares', [
        { memberId: 'a', value: 2 },
        { memberId: 'b', value: 1 },
      ], 1000)).toBeNull();
    });
    it('rejects when all zero', () => {
      expect(validateSplit('shares', [
        { memberId: 'a', value: 0 },
        { memberId: 'b', value: 0 },
      ], 1000)).toMatch(/greater than zero/i);
    });
    it('rejects negative shares', () => {
      expect(validateSplit('shares', [{ memberId: 'a', value: -1 }], 1000))
        .toMatch(/negative/i);
    });
  });

  describe('exact', () => {
    it('passes when amounts sum to total', () => {
      expect(validateSplit('exact', [
        { memberId: 'a', value: 400 },
        { memberId: 'b', value: 600 },
      ], 1000)).toBeNull();
    });
    it('rejects when sum != total', () => {
      expect(validateSplit('exact', [
        { memberId: 'a', value: 400 },
        { memberId: 'b', value: 500 },
      ], 1000)).toMatch(/900 but expense total is 1000/);
    });
    it('rejects non-integer amounts', () => {
      expect(validateSplit('exact', [{ memberId: 'a', value: 100.5 }], 100))
        .toMatch(/integers/i);
    });
  });

  describe('percent', () => {
    it('passes when sums to 100', () => {
      expect(validateSplit('percent', [
        { memberId: 'a', value: 33 },
        { memberId: 'b', value: 33 },
        { memberId: 'c', value: 34 },
      ], 1000)).toBeNull();
    });
    it('rejects when sums to 99', () => {
      expect(validateSplit('percent', [
        { memberId: 'a', value: 33 },
        { memberId: 'b', value: 33 },
        { memberId: 'c', value: 33 },
      ], 1000)).toMatch(/must sum to 100/);
    });
    it('rejects out-of-range percentages', () => {
      expect(validateSplit('percent', [{ memberId: 'a', value: 150 }], 1000))
        .toMatch(/between 0 and 100/);
    });
  });
});
