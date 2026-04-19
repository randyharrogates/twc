import type { Member } from '../types';

export interface FuzzyNameMatch {
  id: string;
  name: string;
  confidence: number;
}

export function diceCoefficient(a: string, b: string): number {
  const lhs = a.trim().toLowerCase();
  const rhs = b.trim().toLowerCase();
  if (lhs.length === 0 || rhs.length === 0) return 0;
  if (lhs === rhs) return 1;
  if (lhs.length === 1 || rhs.length === 1) return 0;
  const lhsGrams = bigrams(lhs);
  const rhsGrams = bigrams(rhs);
  let intersection = 0;
  const counts = new Map<string, number>();
  for (const g of lhsGrams) counts.set(g, (counts.get(g) ?? 0) + 1);
  for (const g of rhsGrams) {
    const left = counts.get(g);
    if (left && left > 0) {
      intersection++;
      counts.set(g, left - 1);
    }
  }
  return (2 * intersection) / (lhsGrams.length + rhsGrams.length);
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

export function fuzzyMatchNames(
  query: string,
  members: Member[],
  minConfidence = 0,
): FuzzyNameMatch[] {
  return members
    .map((m) => ({ id: m.id, name: m.name, confidence: diceCoefficient(query, m.name) }))
    .filter((m) => m.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}
