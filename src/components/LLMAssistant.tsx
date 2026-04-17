import { useState } from 'react';
import type { Group } from '../types';
import type { ExpenseDraft } from '../lib/llm';
import { createLLMClient } from '../lib/llm';
import { useAppStore } from '../state/store';
import { formatMinor } from '../lib/currency';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
}

const client = createLLMClient();

const EXAMPLES = [
  'Alice paid 50 for dinner split with Bob and Charlie',
  'Bob paid ¥6000 for sushi split with Alice and Charlie',
  'Charlie paid 20 for coffee',
];

export function LLMAssistant({ group, open, onClose }: Props) {
  const addExpense = useAppStore((s) => s.addExpense);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const nameById = new Map(group.members.map((m) => [m.id, m.name]));

  const parse = async () => {
    setParsing(true);
    setError(null);
    setDrafts([]);
    const result = await client.parseExpenses(text, {
      members: group.members,
      baseCurrency: group.baseCurrency,
      rateHints: group.rateHints,
    });
    setParsing(false);
    if ('parseError' in result) {
      setError(result.parseError);
      return;
    }
    setDrafts(result.drafts);
  };

  const addAll = () => {
    for (const d of drafts) {
      addExpense(group.id, {
        description: d.description,
        amountMinor: d.amountMinor,
        currency: d.currency,
        rateToBase: d.rateToBase,
        payerId: d.payerId,
        splitMode: d.splitMode,
        split: d.split,
      });
    }
    setDrafts([]);
    setText('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="✨ AI assistant" widthClass="max-w-xl">
      <div className="space-y-3">
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Describe an expense in plain English..."
            className="w-full rounded-md border border-ink-300 bg-ink-100/70 text-ink-800 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
          <div className="mt-1 text-xs text-ink-500">
            Mock parser — handles patterns like:{' '}
            {EXAMPLES.map((ex, i) => (
              <span key={i}>
                <button
                  type="button"
                  onClick={() => setText(ex)}
                  className="text-ink-600 underline decoration-dotted underline-offset-2 hover:text-accent-400"
                >
                  {ex}
                </button>
                {i < EXAMPLES.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={parse} disabled={!text.trim() || parsing}>
            {parsing ? 'Parsing…' : 'Parse'}
          </Button>
        </div>

        {error && <div className="rounded-md border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        {drafts.length > 0 && (
          <>
            <div className="space-y-2">
              {drafts.map((d, i) => (
                <div key={i} className="rounded-xl border border-accent-500/40 bg-ink-100/60 p-3 text-sm">
                  <div className="font-medium text-ink-800">{d.description}</div>
                  <div className="mt-1 text-xs text-ink-600">
                    {nameById.get(d.payerId) ?? '?'} paid · {formatMinor(d.amountMinor, d.currency)}
                    {d.currency !== group.baseCurrency && (
                      <> · rate {d.rateToBase}/{group.baseCurrency}</>
                    )}
                    {' · '}
                    even split with{' '}
                    {d.split
                      .filter((s) => s.value > 0)
                      .map((s) => nameById.get(s.memberId) ?? '?')
                      .join(', ')}
                  </div>
                  {d.unresolvedNames && d.unresolvedNames.length > 0 && (
                    <div className="mt-1 text-xs text-amber-300">
                      Unresolved names: {d.unresolvedNames.join(', ')} — added the draft without them.
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={addAll}>
                Add {drafts.length === 1 ? 'expense' : 'all'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
