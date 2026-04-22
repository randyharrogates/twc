import type { Group } from '../types';
import { formatMinor } from '../lib/currency';
import { computeShares } from '../lib/splits';

interface Props {
  group: Group;
}

export function ExpenseList({ group }: Props) {
  const memberById = new Map(group.members.map((m) => [m.id, m.name]));

  return (
    <section className="border border-[var(--color-ink-200)] rounded p-4">
      <h3 className="text-sm uppercase tracking-wide text-[var(--color-ink-500)] mb-3">Expenses</h3>
      {group.expenses.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">
          No expenses yet. In Claude Code, run{' '}
          <code className="text-[var(--color-accent-400)]">/twc-add-expense {group.id}</code>.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-ink-200)]">
          {group.expenses.map((e) => {
            const shares = computeShares(e);
            return (
              <li key={e.id} className="py-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-[var(--color-ink-800)] font-medium">{e.description}</span>
                    <span className="ml-2 text-xs text-[var(--color-ink-500)]">
                      paid by {memberById.get(e.payerId) ?? e.payerId} · {e.splitMode}
                    </span>
                  </div>
                  <div className="font-mono text-[var(--color-accent-400)]">
                    {formatMinor(e.amountMinor, e.currency)}
                  </div>
                </div>
                {e.currency !== group.baseCurrency && (
                  <div className="text-xs text-[var(--color-ink-500)] mt-0.5">
                    rate to {group.baseCurrency}: {e.rateToBase}
                  </div>
                )}
                <ul className="text-xs text-[var(--color-ink-600)] mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {[...shares.entries()].map(([memberId, amt]) => (
                    <li key={memberId} className="flex justify-between">
                      <span>{memberById.get(memberId) ?? memberId}</span>
                      <span className="font-mono">{formatMinor(amt, e.currency)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
