import type { Group, Transfer } from '../types';
import { convertMinor } from './currency';
import { distributeProportional, sumMinor } from './money';
import { computeShares } from './splits';

/**
 * Compute each member's net balance in base-currency minor units.
 * Positive = owed money (they paid more than their share).
 * Negative = owes money (they paid less than their share).
 *
 * Non-member payers or split entries throw — upstream validation prevents this.
 */
export function computeBalances(group: Group): Map<string, number> {
  const balances = new Map<string, number>();
  for (const m of group.members) balances.set(m.id, 0);

  for (const expense of group.expenses) {
    if (!balances.has(expense.payerId)) {
      throw new Error(`computeBalances: payer ${expense.payerId} is not a group member`);
    }

    const shares = computeShares(expense);
    const memberIds = [...shares.keys()];
    const nativeAmounts = memberIds.map((id) => shares.get(id)!);

    const baseTotal = convertMinor(
      expense.amountMinor,
      expense.currency,
      group.baseCurrency,
      expense.rateToBase,
    );

    const baseAmounts =
      baseTotal === sumMinor(nativeAmounts)
        ? nativeAmounts
        : distributeProportional(baseTotal, nativeAmounts);

    memberIds.forEach((id, i) => {
      if (!balances.has(id)) {
        throw new Error(`computeBalances: split member ${id} is not a group member`);
      }
      balances.set(id, balances.get(id)! - baseAmounts[i]);
    });

    balances.set(expense.payerId, balances.get(expense.payerId)! + baseTotal);
  }

  return balances;
}

/**
 * Greedy minimum-transaction settlement. Assumes Σ balances === 0; throws
 * otherwise (a non-zero residual indicates a rounding bug upstream).
 */
export function settle(balances: Map<string, number>): Transfer[] {
  const total = sumMinor([...balances.values()]);
  if (total !== 0) {
    throw new Error(`settle: balances must sum to 0 in minor units, got ${total}`);
  }

  const creditors = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const debtors = [...balances.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amt = Math.min(creditors[i].v, debtors[j].v);
    if (amt > 0) {
      transfers.push({ from: debtors[j].id, to: creditors[i].id, amountMinor: amt });
    }
    creditors[i].v -= amt;
    debtors[j].v -= amt;
    if (creditors[i].v === 0) i++;
    if (debtors[j].v === 0) j++;
  }

  return transfers;
}
