import { useState } from 'react';
import type { Group } from '../../types';
import type { ExpenseDraft } from '../../lib/llm/types';
import { formatMinor, convertMinor } from '../../lib/currency';
import { Button } from '../ui/Button';
import { ExpenseDialog } from '../ExpenseDialog';

interface Props {
  draft: ExpenseDraft;
  group: Group;
  accepted: boolean;
  onAccept: () => void;
  onMarkAccepted: () => void;
  onDiscard: () => void;
}

export function DraftCard({ draft, group, accepted, onAccept, onMarkAccepted, onDiscard }: Props) {
  const [editing, setEditing] = useState(false);
  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const participants = draft.split.filter((s) => s.value > 0);
  const baseEquivalent =
    draft.currency === group.baseCurrency
      ? null
      : convertMinor(draft.amountMinor, draft.currency, group.baseCurrency, draft.rateToBase);

  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        accepted
          ? 'border-emerald-400/40 bg-emerald-500/5'
          : 'border-accent-500/40 bg-ink-100/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-800">{draft.description}</div>
          <div className="mt-0.5 text-xs text-ink-600">
            {nameById.get(draft.payerId) ?? 'Unknown'} paid ·{' '}
            <span className="font-mono">{formatMinor(draft.amountMinor, draft.currency)}</span>
            {baseEquivalent !== null && (
              <>
                {' '}
                ·{' '}
                <span className="font-mono">{formatMinor(baseEquivalent, group.baseCurrency)}</span>
                <span className="text-ink-500"> (base)</span>
              </>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            {draft.splitMode} split ·{' '}
            {participants.map((s) => nameById.get(s.memberId) ?? '?').join(', ')}
          </div>
          {draft.unresolvedNames && draft.unresolvedNames.length > 0 && (
            <div className="mt-1 text-xs text-amber-300">
              Unresolved: {draft.unresolvedNames.join(', ')} — edit after accepting to fix.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {accepted ? (
            <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              Added
            </span>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={onAccept}>
                Accept
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={onDiscard}>
                Discard
              </Button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <ExpenseDialog
          key={`draft-${draft.description}`}
          group={group}
          expense={null}
          initialDraft={draft}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => onMarkAccepted()}
        />
      )}
    </div>
  );
}
