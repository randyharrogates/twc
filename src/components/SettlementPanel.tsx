import { useMemo } from 'react';
import type { Group } from '../types';
import { formatMinor } from '../lib/currency';
import { computeBalances, settle } from '../lib/settlement';

interface Props {
  group: Group;
}

export function SettlementPanel({ group }: Props) {
  const { balances, transfers, error } = useMemo(() => {
    try {
      const b = computeBalances(group);
      const t = settle(b);
      return { balances: b, transfers: t, error: null as string | null };
    } catch (e) {
      return {
        balances: new Map<string, number>(),
        transfers: [],
        error: (e as Error).message,
      };
    }
  }, [group]);

  if (error) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">Settlement</h2>
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      </section>
    );
  }

  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const sortedBalances = [...balances.entries()].sort((a, b) => b[1] - a[1]);
  const totalExpense = group.expenses.length;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">Settlement</h2>

      {totalExpense === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
          Add an expense to see the settlement.
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Balances</div>
            <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
              {sortedBalances.map(([id, v]) => (
                <li key={id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-neutral-800">{nameById.get(id) ?? 'Unknown'}</span>
                  <span
                    className={`font-mono ${
                      v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : 'text-neutral-500'
                    }`}
                  >
                    {v > 0 ? '+' : ''}
                    {formatMinor(v, group.baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Transfers</div>
            {transfers.length === 0 ? (
              <div className="rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-500">
                Everyone is settled up.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                {transfers.map((t, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="text-neutral-800">
                      <span className="font-medium">{nameById.get(t.from) ?? '?'}</span>
                      {' → '}
                      <span className="font-medium">{nameById.get(t.to) ?? '?'}</span>
                    </span>
                    <span className="font-mono text-neutral-900">
                      {formatMinor(t.amountMinor, group.baseCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
