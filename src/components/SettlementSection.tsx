import { useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import type { Group, Transfer } from '../types';
import {
  computeBalances,
  isBalanced,
  settle,
  transferImbalance,
} from '../lib/settlement';
import { CountUp } from './ui/CountUp';
import { SectionReveal } from './ui/SectionReveal';
import { TransfersEditor } from './TransfersEditor';
import { SettlementSummaryCard } from './SettlementSummaryCard';

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

interface SettlementModel {
  balances: Map<string, number>;
  autoTransfers: Transfer[];
  effectiveTransfers: Transfer[];
  stale: boolean;
  error: string | null;
}

function SettlementContent({ group }: { group: Group }) {
  const model: SettlementModel = useMemo(() => {
    try {
      const balances = computeBalances(group);
      const autoTransfers = settle(balances);
      if (group.customTransfers !== undefined) {
        const stale = !isBalanced(transferImbalance(balances, group.customTransfers));
        return {
          balances,
          autoTransfers,
          effectiveTransfers: group.customTransfers,
          stale,
          error: null,
        };
      }
      return {
        balances,
        autoTransfers,
        effectiveTransfers: autoTransfers,
        stale: false,
        error: null,
      };
    } catch (e) {
      return {
        balances: new Map<string, number>(),
        autoTransfers: [],
        effectiveTransfers: [],
        stale: false,
        error: (e as Error).message,
      };
    }
  }, [group]);

  const wasSettled = useRef<boolean>(false);
  const isSettled =
    group.expenses.length > 0 &&
    model.effectiveTransfers.length === 0 &&
    !model.error &&
    !model.stale;

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

  if (model.error) {
    return (
      <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {model.error}
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

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <BalancesCard group={group} balances={model.balances} />
      <TransfersEditor
        group={group}
        balances={model.balances}
        transfers={model.effectiveTransfers}
        autoTransfers={model.autoTransfers}
        stale={model.stale}
      />
      <SettlementSummaryCard
        group={group}
        balances={model.balances}
        transfers={model.effectiveTransfers}
      />
    </div>
  );
}

function BalancesCard({
  group,
  balances,
}: {
  group: Group;
  balances: Map<string, number>;
}) {
  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const sortedBalances = [...balances.entries()].sort((a, b) => b[1] - a[1]);

  return (
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
  );
}
