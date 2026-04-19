import { useId, useMemo, useState } from 'react';
import type { CurrencyCode, Member } from '../types';
import { formatMinor } from '../lib/currency';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface Props {
  open: boolean;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  members: Member[];
  groupName: string;
  onPick: (payerId: string) => void;
  onCancel: () => void;
}

export function PayerPromptDialog({
  open,
  description,
  amountMinor,
  currency,
  members,
  groupName,
  onPick,
  onCancel,
}: Props) {
  const groupId = useId();
  const [selected, setSelected] = useState<string | null>(null);

  const amountLabel = useMemo(
    () => `${formatMinor(amountMinor, currency)} ${currency}`,
    [amountMinor, currency],
  );

  const submit = () => {
    if (selected) onPick(selected);
  };

  return (
    <Dialog open={open} onClose={onCancel} title="Who paid?" widthClass="max-w-md">
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          The assistant needs to know who paid for this expense in group{' '}
          <em>{groupName}</em>.
        </p>
        <div className="rounded-md border border-ink-300 bg-ink-100/40 px-3 py-2 text-sm">
          <div className="text-ink-800">{description}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-600">{amountLabel}</div>
        </div>
        {members.length === 0 ? (
          <p className="text-xs text-amber-400">
            This group has no members yet. Cancel and add a member first.
          </p>
        ) : (
          <fieldset className="space-y-1" aria-label="Pick a payer">
            <legend className="sr-only">Pick a payer</legend>
            {members.map((m) => {
              const id = `${groupId}-${m.id}`;
              return (
                <label
                  key={m.id}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-ink-100/60"
                >
                  <input
                    id={id}
                    type="radio"
                    name={groupId}
                    value={m.id}
                    checked={selected === m.id}
                    onChange={() => setSelected(m.id)}
                  />
                  <span>{m.name}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!selected}>
            Pick
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
