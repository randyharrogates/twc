import { motion } from 'framer-motion';
import type { Group } from '../types';
import { convertMinor, formatMinor } from '../lib/currency';

interface Props {
  group: Group;
  active: boolean;
  onClick: () => void;
}

export function GroupCard({ group, active, onClick }: Props) {
  const totalBase = group.expenses.reduce(
    (sum, e) => sum + convertMinor(e.amountMinor, e.currency, group.baseCurrency, e.rateToBase),
    0,
  );

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`group relative flex h-48 flex-col justify-between rounded-2xl border bg-ink-100/60 p-6 text-left backdrop-blur transition-colors ${
        active
          ? 'border-accent-500 glow-accent'
          : 'border-ink-300 hover:border-accent-500/60'
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-ink-300 px-2 py-0.5 text-[10px] font-medium tracking-wider text-ink-600">
            {group.baseCurrency}
          </span>
          {active && (
            <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wider text-accent-400">
              ACTIVE
            </span>
          )}
        </div>
        <h3 className="mt-3 font-display text-3xl tracking-wide text-ink-800 group-hover:text-accent-400">
          {group.name}
        </h3>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-xs text-ink-500">
          {group.members.length} member{group.members.length === 1 ? '' : 's'} ·{' '}
          {group.expenses.length} expense{group.expenses.length === 1 ? '' : 's'}
        </div>
        <div className="font-mono text-sm text-ink-700">
          {formatMinor(totalBase, group.baseCurrency)}
        </div>
      </div>
    </motion.button>
  );
}
