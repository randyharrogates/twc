import { useMemo, useState } from 'react';
import type { Group, Transfer } from '../types';
import {
  isBalanced,
  transferImbalance,
} from '../lib/settlement';
import { formatMinor, minorDecimals, parseAmountToMinor } from '../lib/currency';
import { useAppStore } from '../state/store';
import { Button } from './ui/Button';
import { CountUp } from './ui/CountUp';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface Props {
  group: Group;
  balances: Map<string, number>;
  transfers: Transfer[];
  autoTransfers: Transfer[];
  stale: boolean;
}

export function TransfersEditor({
  group,
  balances,
  transfers,
  autoTransfers,
  stale,
}: Props) {
  const nameById = new Map(group.members.map((m) => [m.id, m.name]));
  const [editing, setEditing] = useState(false);
  const setCustomTransfers = useAppStore((s) => s.setCustomTransfers);
  const clearCustomTransfers = useAppStore((s) => s.clearCustomTransfers);

  const imbalance = useMemo(
    () => transferImbalance(balances, transfers),
    [balances, transfers],
  );
  const balanced = isBalanced(imbalance);

  const isCustom = group.customTransfers !== undefined;

  const resetToAuto = () => {
    clearCustomTransfers(group.id);
    setEditing(false);
  };

  const startEdit = () => {
    if (!isCustom) {
      setCustomTransfers(group.id, autoTransfers);
    }
    setEditing(true);
  };

  const updateRow = (i: number, next: Transfer) => {
    const copy = [...transfers];
    copy[i] = next;
    setCustomTransfers(group.id, copy);
  };

  const deleteRow = (i: number) => {
    const copy = transfers.filter((_, idx) => idx !== i);
    setCustomTransfers(group.id, copy);
  };

  const addRow = () => {
    const first = group.members[0]?.id ?? '';
    const second = group.members[1]?.id ?? first;
    setCustomTransfers(group.id, [
      ...transfers,
      { from: first, to: second, amountMinor: 0 },
    ]);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm tracking-widest text-ink-500">TRANSFERS</h3>
        <div className="flex items-center gap-2">
          {isCustom && (
            <span className="font-script text-xs text-accent-400">manual</span>
          )}
          {editing ? (
            <Button size="sm" onClick={() => setEditing(false)}>Done</Button>
          ) : (
            <Button size="sm" onClick={startEdit}>Edit</Button>
          )}
          {isCustom && (
            <Button size="sm" variant="danger" onClick={resetToAuto}>
              Reset to auto
            </Button>
          )}
        </div>
      </div>

      {stale && (
        <div className="mb-4 rounded-xl border border-yellow-400/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          <p className="font-medium">Manual transfers are out of date.</p>
          <p className="mt-1 text-xs text-yellow-200/80">
            Expenses have changed since you edited these transfers. Reset to
            auto or edit to re-balance.
          </p>
        </div>
      )}

      {!balanced && (
        <ImbalanceBanner group={group} imbalance={imbalance} nameById={nameById} />
      )}

      {transfers.length === 0 && !editing ? (
        <div className="rounded-2xl border border-accent-500/40 bg-accent-500/5 px-6 py-10 text-center">
          <p className="font-display text-2xl tracking-wide text-accent-400">ALL SETTLED</p>
          <p className="mt-2 text-sm text-ink-500">Everyone is square.</p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-200/50 rounded-2xl border border-ink-300 bg-ink-100/40">
          {transfers.map((t, i) =>
            editing ? (
              <EditableRow
                key={i}
                members={group.members}
                transfer={t}
                currency={group.baseCurrency}
                onChange={(next) => updateRow(i, next)}
                onDelete={() => deleteRow(i)}
              />
            ) : (
              <ReadonlyRow
                key={i}
                transfer={t}
                nameById={nameById}
                currency={group.baseCurrency}
              />
            ),
          )}
          {editing && (
            <li className="px-4 py-3">
              <Button size="sm" onClick={addRow}>+ Add transfer</Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ReadonlyRow({
  transfer,
  nameById,
  currency,
}: {
  transfer: Transfer;
  nameById: Map<string, string>;
  currency: Group['baseCurrency'];
}) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-ink-700">
        <span className="font-medium">{nameById.get(transfer.from) ?? '?'}</span>
        <span className="mx-2 text-accent-400">→</span>
        <span className="font-medium">{nameById.get(transfer.to) ?? '?'}</span>
      </span>
      <span className="font-mono text-sm text-ink-800">
        <CountUp valueMinor={transfer.amountMinor} currency={currency} />
      </span>
    </li>
  );
}

function EditableRow({
  members,
  transfer,
  currency,
  onChange,
  onDelete,
}: {
  members: Group['members'];
  transfer: Transfer;
  currency: Group['baseCurrency'];
  onChange: (next: Transfer) => void;
  onDelete: () => void;
}) {
  const dec = minorDecimals(currency);
  const major = dec === 0
    ? String(transfer.amountMinor)
    : (transfer.amountMinor / 10 ** dec).toFixed(dec);

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <div className="min-w-[120px] flex-1">
        <Select
          aria-label="From member"
          value={transfer.from}
          onChange={(e) => onChange({ ...transfer, from: e.target.value })}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </div>
      <span className="text-accent-400">→</span>
      <div className="min-w-[120px] flex-1">
        <Select
          aria-label="To member"
          value={transfer.to}
          onChange={(e) => onChange({ ...transfer, to: e.target.value })}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <Input
          type="text"
          inputMode="decimal"
          aria-label="Amount"
          value={major}
          onChange={(e) => {
            const parsed = parseAmountToMinor(e.target.value || '0', currency);
            onChange({ ...transfer, amountMinor: parsed ?? 0 });
          }}
        />
      </div>
      <Button size="sm" variant="danger" onClick={onDelete} aria-label="Delete transfer">
        ×
      </Button>
    </li>
  );
}

function ImbalanceBanner({
  group,
  imbalance,
  nameById,
}: {
  group: Group;
  imbalance: Map<string, number>;
  nameById: Map<string, string>;
}) {
  const entries = [...imbalance.entries()].filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      <p className="font-medium">Transfers do not balance.</p>
      <ul className="mt-2 space-y-0.5 text-xs text-red-200/90">
        {entries.map(([id, v]) => {
          const sign = v > 0 ? '+' : '';
          return (
            <li key={id} className="font-mono">
              {nameById.get(id) ?? id}: {sign}
              {formatMinor(v, group.baseCurrency)} imbalanced
            </li>
          );
        })}
      </ul>
    </div>
  );
}
