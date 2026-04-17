import { useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import type { Group } from '../types';
import { computeBalances, settle } from '../lib/settlement';
import { CountUp } from './ui/CountUp';
import { SectionReveal } from './ui/SectionReveal';

interface Props {
  group: Group | null;
}

export function SettlementSection({ group }: Props) {
  return (
    <SectionReveal id="settlement" className="min-h-screen px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12">
          <p className="font-script text-lg text-accent-400">step three</p>
          <h2 className="font-display text-5xl tracking-wide text-ink-800 md:text-6xl">SETTLEMENT</h2>
        </div>

        {!group ? (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-100/30 px-8 py-20 text-center">
            <p className="font-script text-2xl text-ink-500">← pick a group to see the settlement</p>
          </div>
        ) : (
          <SettlementContent group={group} />
        )}
      </div>
    </SectionReveal>
  );
}

function SettlementContent({ group }: { group: Group }) {
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

  const wasSettled = useRef<boolean>(false);
  const isSettled = group.expenses.length > 0 && transfers.length === 0 && !error;

  useEffect(() => {
    if (isSettled && !wasSettled.current) {
      wasSettled.current = true;
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.7 },
        colors: ['#14b8a6'],
      });
    }
    if (!isSettled) wasSettled.current = false;
  }, [isSettled]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (group.expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-100/30 px-8 py-20 text-center">
        <p className="font-script text-2xl text-ink-500">No expenses yet — add some above.</p>
      </div>
    );
  }

  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const sortedBalances = [...balances.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div>
        <h3 className="mb-4 font-display text-sm tracking-widest text-ink-500">BALANCES</h3>
        <ul className="divide-y divide-ink-200/50 rounded-2xl border border-ink-300 bg-ink-100/40">
          {sortedBalances.map(([id, v]) => (
            <li key={id} className="flex items-center justify-between px-4 py-3">
              <span className="text-ink-700">{nameById.get(id) ?? 'Unknown'}</span>
              <span
                className={`font-mono text-sm ${
                  v > 0 ? 'text-accent-400' : v < 0 ? 'text-red-400' : 'text-ink-500'
                }`}
              >
                {v > 0 ? '+' : ''}
                <CountUp valueMinor={v} currency={group.baseCurrency} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-4 font-display text-sm tracking-widest text-ink-500">TRANSFERS</h3>
        {transfers.length === 0 ? (
          <div className="rounded-2xl border border-accent-500/40 bg-accent-500/5 px-6 py-10 text-center">
            <p className="font-display text-2xl tracking-wide text-accent-400">ALL SETTLED</p>
            <p className="mt-2 text-sm text-ink-500">Everyone is square.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-200/50 rounded-2xl border border-ink-300 bg-ink-100/40">
            {transfers.map((t, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-ink-700">
                  <span className="font-medium">{nameById.get(t.from) ?? '?'}</span>
                  <span className="mx-2 text-accent-400">→</span>
                  <span className="font-medium">{nameById.get(t.to) ?? '?'}</span>
                </span>
                <span className="font-mono text-sm text-ink-800">
                  <CountUp valueMinor={t.amountMinor} currency={group.baseCurrency} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
