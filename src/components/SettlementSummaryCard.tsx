import { useMemo, useState } from 'react';
import type { Group, Transfer } from '../types';
import { formatSettlementSummary } from '../lib/summary';
import { Button } from './ui/Button';

interface Props {
  group: Group;
  balances: Map<string, number>;
  transfers: Transfer[];
}

export function SettlementSummaryCard({ group, balances, transfers }: Props) {
  const text = useMemo(
    () => formatSettlementSummary(group, balances, transfers),
    [group, balances, transfers],
  );
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      window.setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 1500);
    }
  };

  return (
    <div className="md:col-span-2">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h3 className="font-display text-sm tracking-widest text-ink-500">SUMMARY</h3>
        <Button type="button" variant="primary" size="sm" onClick={onCopy}>
          {state === 'copied' ? 'Copied' : state === 'error' ? 'Copy failed' : 'Copy to clipboard'}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-ink-300 bg-ink-100/40 px-5 py-4 font-mono text-xs leading-relaxed text-ink-700">
        {text}
      </pre>
    </div>
  );
}
