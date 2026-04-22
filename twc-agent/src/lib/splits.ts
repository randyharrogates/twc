import type { Expense } from '../types';
import { distributeProportional } from './money';

/**
 * Σ of returned values === expense.amountMinor whenever the split is valid.
 */
export function computeShares(expense: Expense): Map<string, number> {
  const { splitMode, split, amountMinor } = expense;
  const out = new Map<string, number>();

  switch (splitMode) {
    case 'even': {
      const isParticipant = split.map((s) => s.value > 0);
      const weights = isParticipant.map((p) => (p ? 1 : 0));
      const amounts = distributeProportional(amountMinor, weights);
      split.forEach((s, i) => out.set(s.memberId, amounts[i]));
      return out;
    }
    case 'shares':
    case 'percent': {
      const weights = split.map((s) => s.value);
      const amounts = distributeProportional(amountMinor, weights);
      split.forEach((s, i) => out.set(s.memberId, amounts[i]));
      return out;
    }
    case 'exact': {
      for (const s of split) out.set(s.memberId, s.value);
      return out;
    }
  }
}
