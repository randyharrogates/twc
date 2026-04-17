import { useState } from 'react';
import type { Expense, Group } from '../types';
import { formatMinor, convertMinor } from '../lib/currency';
import { useAppStore } from '../state/store';
import { Button } from './ui/Button';
import { ExpenseDialog } from './ExpenseDialog';
import { Sparkle, Plus } from './ui/icons';

interface Props {
  group: Group;
  onOpenLLM: () => void;
}

function splitSummary(exp: Expense, group: Group): string {
  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const participants = exp.split.filter((s) => s.value > 0);
  switch (exp.splitMode) {
    case 'even':
      return `even · ${participants.length} people`;
    case 'shares': {
      const parts = participants.map((s) => `${nameById.get(s.memberId) ?? '?'}=${s.value}`);
      return `shares · ${parts.join(', ')}`;
    }
    case 'exact':
      return `exact · ${participants.length} entries`;
    case 'percent':
      return `percent · ${participants.length} entries`;
  }
}

export function ExpenseList({ group, onOpenLLM }: Props) {
  const deleteExpense = useAppStore((s) => s.deleteExpense);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setOpen(true);
  };

  const nameById = new Map(group.members.map((m) => [m.id, m.name]));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-widest text-ink-500">EXPENSES</h3>
        <div className="flex gap-2">
          <Button onClick={onOpenLLM} className="gap-2">
            <Sparkle className="h-3.5 w-3.5" />
            AI assistant
          </Button>
          <Button variant="primary" onClick={openNew} disabled={group.members.length === 0} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add expense
          </Button>
        </div>
      </div>

      {group.expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-100/30 px-4 py-12 text-center text-sm text-ink-500">
          No expenses yet.
        </div>
      ) : (
        <ul className="divide-y divide-ink-200/50 rounded-2xl border border-ink-300 bg-ink-100/40">
          {group.expenses.map((e) => {
            const baseAmt = convertMinor(e.amountMinor, e.currency, group.baseCurrency, e.rateToBase);
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-ink-100/60">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-800">{e.description}</div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {nameById.get(e.payerId) ?? 'Unknown'} paid · {splitSummary(e, group)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-medium text-ink-800">{formatMinor(e.amountMinor, e.currency)}</div>
                  {e.currency !== group.baseCurrency && (
                    <div className="font-mono text-xs text-ink-500">
                      × {e.rateToBase} = {formatMinor(baseAmt, group.baseCurrency)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" onClick={() => openEdit(e)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteExpense(group.id, e.id)}>Delete</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <ExpenseDialog group={group} expense={editing} open={open} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
