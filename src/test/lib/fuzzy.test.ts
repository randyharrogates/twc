import { describe, expect, it } from 'vitest';
import { diceCoefficient, fuzzyMatchNames } from '../../lib/fuzzy';

describe('diceCoefficient', () => {
  it('returns 1 for identical non-empty strings (case-insensitive)', () => {
    expect(diceCoefficient('marcus', 'Marcus')).toBe(1);
  });

  it('returns 0 when neither string shares a bigram', () => {
    expect(diceCoefficient('abcd', 'wxyz')).toBe(0);
  });

  it('returns a value in (0, 1) for partial overlap and is symmetric', () => {
    const s = diceCoefficient('marcus', 'markus');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    expect(diceCoefficient('markus', 'marcus')).toBe(s);
  });

  it('handles single-character strings (no bigrams) with 1 for identical, 0 for different', () => {
    expect(diceCoefficient('a', 'a')).toBe(1);
    expect(diceCoefficient('a', 'b')).toBe(0);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(diceCoefficient('  marcus  ', 'marcus')).toBe(1);
  });
});

describe('fuzzyMatchNames', () => {
  const members = [
    { id: 'm1', name: 'Marcus' },
    { id: 'm2', name: 'Mark' },
    { id: 'm3', name: 'Alice' },
  ];

  it('returns exact matches first with confidence 1', () => {
    const res = fuzzyMatchNames('Marcus', members);
    expect(res[0]).toEqual({ id: 'm1', name: 'Marcus', confidence: 1 });
  });

  it('sorts matches by descending confidence', () => {
    const res = fuzzyMatchNames('Markus', members);
    const confidences = res.map((m) => m.confidence);
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i - 1]).toBeGreaterThanOrEqual(confidences[i]);
    }
  });

  it('filters by a minimum confidence threshold', () => {
    const res = fuzzyMatchNames('Marcus', members, 0.5);
    for (const m of res) expect(m.confidence).toBeGreaterThanOrEqual(0.5);
    const ids = res.map((m) => m.id);
    expect(ids).toContain('m1');
    expect(ids).not.toContain('m3'); // "Alice" scores too low
  });

  it('returns an empty array when the member list is empty', () => {
    expect(fuzzyMatchNames('anything', [])).toEqual([]);
  });
});
