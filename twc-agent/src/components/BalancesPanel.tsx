import type { Group, Transfer } from '../types';
import { formatMinor } from '../lib/currency';

interface Props {
  group: Group;
  balances: Map<string, number>;
  transfers: Transfer[];
}

export function BalancesPanel({ group, balances, transfers }: Props) {
  const memberById = new Map(group.members.map((m) => [m.id, m.name]));

  return (
    <section className="border border-[var(--color-ink-200)] rounded p-4 space-y-4">
      <h3 className="text-sm uppercase tracking-wide text-[var(--color-ink-500)]">
        Balances & settlement <span className="normal-case text-[var(--color-ink-500)]">({group.baseCurrency})</span>
      </h3>

      <div>
        <h4 className="text-xs text-[var(--color-ink-500)] mb-1">Net per member</h4>
        <ul className="divide-y divide-[var(--color-ink-200)]">
          {[...balances.entries()].map(([id, v]) => (
            <li key={id} className="py-1.5 flex justify-between text-sm">
              <span>{memberById.get(id) ?? id}</span>
              <span
                className={`font-mono ${
                  v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-[var(--color-ink-500)]'
                }`}
              >
                {formatMinor(v, group.baseCurrency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs text-[var(--color-ink-500)] mb-1">
          Suggested transfers ({transfers.length})
        </h4>
        {transfers.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-500)]">Everyone's settled up.</p>
        ) : (
          <ul className="space-y-1">
            {transfers.map((t, i) => (
              <li key={i} className="text-sm flex items-center gap-2">
                <span className="text-[var(--color-ink-600)]">
                  {memberById.get(t.from) ?? t.from}
                </span>
                <span className="text-[var(--color-ink-500)]">→</span>
                <span className="text-[var(--color-ink-800)]">
                  {memberById.get(t.to) ?? t.to}
                </span>
                <span className="ml-auto font-mono text-[var(--color-accent-400)]">
                  {formatMinor(t.amountMinor, group.baseCurrency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {group.settlement && (
          <p className="text-xs text-[var(--color-ink-500)] mt-2">
            Settled-of-record:{' '}
            {group.settledAt ? new Date(group.settledAt).toLocaleString() : 'yes'} (see JSON file for
            the recorded transfers).
          </p>
        )}
      </div>
    </section>
  );
}
