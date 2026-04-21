import type { SplitEntry, SplitMode } from '../types';

const PERCENT_EPSILON = 0.01;

export function validateAmountMinor(amountMinor: number): string | null {
  if (!Number.isInteger(amountMinor)) return 'Amount must be a whole number of minor units.';
  if (amountMinor <= 0) return 'Amount must be greater than zero.';
  return null;
}

export function validateRate(rate: number, sameCurrency: boolean): string | null {
  if (sameCurrency) return null;
  if (!Number.isFinite(rate) || rate <= 0) return 'Rate must be a positive number.';
  return null;
}

export function validateSplit(
  mode: SplitMode,
  split: SplitEntry[],
  amountMinor: number,
): string | null {
  if (split.length === 0) return 'No members in split.';

  switch (mode) {
    case 'even': {
      const participants = split.filter((s) => s.value > 0);
      return participants.length > 0 ? null : 'Select at least one participant.';
    }
    case 'shares': {
      if (split.some((s) => !Number.isFinite(s.value) || s.value < 0)) {
        return 'Shares cannot be negative.';
      }
      const total = split.reduce((a, s) => a + s.value, 0);
      return total > 0 ? null : 'Total shares must be greater than zero.';
    }
    case 'exact': {
      if (!split.every((s) => Number.isInteger(s.value) && s.value >= 0)) {
        return 'Exact amounts must be non-negative integers (minor units).';
      }
      const sum = split.reduce((a, s) => a + s.value, 0);
      if (sum !== amountMinor) {
        return `Exact amounts sum to ${sum} but expense total is ${amountMinor}.`;
      }
      return null;
    }
    case 'percent': {
      if (split.some((s) => !Number.isFinite(s.value) || s.value < 0 || s.value > 100)) {
        return 'Percentages must be between 0 and 100.';
      }
      const sum = split.reduce((a, s) => a + s.value, 0);
      if (Math.abs(sum - 100) > PERCENT_EPSILON) {
        return `Percentages sum to ${sum.toFixed(2)}, must sum to 100.`;
      }
      return null;
    }
  }
}
