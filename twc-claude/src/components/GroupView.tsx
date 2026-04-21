import { useMemo } from 'react';
import type { Group } from '../types';
import { formatMinor } from '../lib/currency';
import { computeBalances, settle } from '../lib/settlement';
import { MemberList } from './MemberList';
import { ExpenseList } from './ExpenseList';
import { BalancesPanel } from './BalancesPanel';

interface Props {
  group: Group;
  onUpdate: (next: Group) => void;
}

export function GroupView({ group, onUpdate }: Props) {
  const settlement = useMemo(() => {
    try {
      const balances = computeBalances(group);
      return { balances, transfers: settle(balances), error: null as string | null };
    } catch (e) {
      return { balances: null, transfers: null, error: (e as Error).message };
    }
  }, [group]);

  const totalSpent = group.expenses.reduce((a, e) => a + e.amountMinor, 0);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-[var(--color-ink-800)]">{group.name}</h2>
        <p className="text-sm text-[var(--color-ink-500)] mt-1">
          Base {group.baseCurrency} · {group.members.length} member{group.members.length === 1 ? '' : 's'} ·{' '}
          {group.expenses.length} expense{group.expenses.length === 1 ? '' : 's'} ·{' '}
          total {formatMinor(totalSpent, group.baseCurrency)} (sum of expense amounts, before FX)
        </p>
      </header>

      <MemberList group={group} onUpdate={onUpdate} />
      <ExpenseList group={group} />

      {settlement.error ? (
        <div className="border border-red-500/50 bg-red-500/10 text-red-300 rounded p-3 text-sm">
          Settlement failed: {settlement.error}
        </div>
      ) : (
        settlement.balances && settlement.transfers && (
          <BalancesPanel
            group={group}
            balances={settlement.balances}
            transfers={settlement.transfers}
          />
        )
      )}
    </div>
  );
}
