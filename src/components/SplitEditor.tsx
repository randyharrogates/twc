import type { CurrencyCode, Member, SplitEntry, SplitMode } from '../types';
import { parseAmountToMinor, formatMinor, minorDecimals } from '../lib/currency';
import { Input } from './ui/Input';

interface Props {
  mode: SplitMode;
  members: Member[];
  split: SplitEntry[];
  amountMinor: number;
  currency: CurrencyCode;
  onModeChange: (mode: SplitMode) => void;
  onSplitChange: (split: SplitEntry[]) => void;
}

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'even', label: 'Even' },
  { value: 'shares', label: 'Shares' },
  { value: 'exact', label: 'Exact' },
  { value: 'percent', label: 'Percent' },
];

function setValue(split: SplitEntry[], memberId: string, value: number): SplitEntry[] {
  return split.map((s) => (s.memberId === memberId ? { ...s, value } : s));
}

export function SplitEditor({
  mode,
  members,
  split,
  amountMinor,
  currency,
  onModeChange,
  onSplitChange,
}: Props) {
  const entryFor = (id: string): SplitEntry =>
    split.find((s) => s.memberId === id) ?? { memberId: id, value: 0 };

  const dec = minorDecimals(currency);
  const toMajor = (m: number) => (dec === 0 ? String(m) : (m / 10 ** dec).toFixed(dec));

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full border border-ink-300 bg-ink-100/60 p-0.5 text-xs">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={`rounded-full px-3 py-1 font-medium uppercase tracking-wider transition-colors ${
              mode === m.value ? 'bg-accent-500 text-ink-0' : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-ink-200/50 rounded-xl border border-ink-300 bg-ink-100/40">
        {members.map((m) => {
          const entry = entryFor(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 text-ink-700">{m.name}</span>
              {mode === 'even' && (
                <label className="flex items-center gap-2 text-xs text-ink-500">
                  <input
                    type="checkbox"
                    checked={entry.value > 0}
                    onChange={(e) => onSplitChange(setValue(split, m.id, e.target.checked ? 1 : 0))}
                  />
                  Participating
                </label>
              )}
              {mode === 'shares' && (
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={entry.value}
                    onChange={(e) => onSplitChange(setValue(split, m.id, Number(e.target.value) || 0))}
                  />
                </div>
              )}
              {mode === 'exact' && (
                <div className="w-32">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={entry.value === 0 ? '' : toMajor(entry.value)}
                    onChange={(e) => {
                      const parsed = parseAmountToMinor(e.target.value || '0', currency);
                      onSplitChange(setValue(split, m.id, parsed ?? 0));
                    }}
                  />
                </div>
              )}
              {mode === 'percent' && (
                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={entry.value}
                    onChange={(e) => onSplitChange(setValue(split, m.id, Number(e.target.value) || 0))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {mode === 'exact' && (
        <SumHint
          sum={split.reduce((a, s) => a + s.value, 0)}
          target={amountMinor}
          currency={currency}
        />
      )}
      {mode === 'percent' && (
        <PercentHint sum={split.reduce((a, s) => a + s.value, 0)} />
      )}
    </div>
  );
}

function SumHint({ sum, target, currency }: { sum: number; target: number; currency: CurrencyCode }) {
  const ok = sum === target;
  return (
    <div className={`text-xs ${ok ? 'text-ink-500' : 'text-red-400'}`}>
      Sum: {formatMinor(sum, currency)} / {formatMinor(target, currency)}
    </div>
  );
}

function PercentHint({ sum }: { sum: number }) {
  const ok = Math.abs(sum - 100) < 0.01;
  return (
    <div className={`text-xs ${ok ? 'text-ink-500' : 'text-red-400'}`}>
      Sum: {sum.toFixed(2)}% / 100.00%
    </div>
  );
}
