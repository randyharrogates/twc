import { useMemo, useState } from 'react';
import type { CurrencyCode, Expense, Group, SplitEntry, SplitMode } from '../types';
import { useAppStore, type ExpenseInput } from '../state/store';
import {
  CURRENCIES,
  CURRENCY_CODES,
  formatMinor,
  minorDecimals,
  parseAmountToMinor,
  convertMinor,
} from '../lib/currency';
import { validateAmountMinor, validateRate, validateSplit } from '../lib/validation';
import type { ExpenseDraft } from '../lib/llm/types';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { SplitEditor } from './SplitEditor';

interface Props {
  group: Group;
  expense: Expense | null;
  initialDraft?: ExpenseDraft;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface FormState {
  description: string;
  amountRaw: string;
  currency: CurrencyCode;
  rateRaw: string;
  payerId: string;
  mode: SplitMode;
  split: SplitEntry[];
}

function defaultSplit(group: Group): SplitEntry[] {
  return group.members.map((m) => ({ memberId: m.id, value: 1 }));
}

function amountToRaw(amountMinor: number, currency: CurrencyCode): string {
  const dec = minorDecimals(currency);
  if (amountMinor === 0) return '';
  return dec === 0 ? String(amountMinor) : (amountMinor / 10 ** dec).toFixed(dec);
}

function initialFormState(
  group: Group,
  expense: Expense | null,
  initialDraft?: ExpenseDraft,
): FormState {
  if (expense) {
    const byId = new Map(expense.split.map((s) => [s.memberId, s]));
    return {
      description: expense.description,
      amountRaw: amountToRaw(expense.amountMinor, expense.currency),
      currency: expense.currency,
      rateRaw: expense.currency === group.baseCurrency ? '' : String(expense.rateToBase),
      payerId: expense.payerId,
      mode: expense.splitMode,
      split: group.members.map((m) => byId.get(m.id) ?? { memberId: m.id, value: 0 }),
    };
  }
  if (initialDraft) {
    const byId = new Map(initialDraft.split.map((s) => [s.memberId, s]));
    return {
      description: initialDraft.description,
      amountRaw: amountToRaw(initialDraft.amountMinor, initialDraft.currency),
      currency: initialDraft.currency,
      rateRaw:
        initialDraft.currency === group.baseCurrency ? '' : String(initialDraft.rateToBase),
      payerId: initialDraft.payerId,
      mode: initialDraft.splitMode,
      split: group.members.map((m) => byId.get(m.id) ?? { memberId: m.id, value: 0 }),
    };
  }
  return {
    description: '',
    amountRaw: '',
    currency: group.baseCurrency,
    rateRaw: '',
    payerId: group.members[0]?.id ?? '',
    mode: 'even',
    split: defaultSplit(group),
  };
}

export function ExpenseDialog({ group, expense, initialDraft, open, onClose, onSaved }: Props) {
  const addExpense = useAppStore((s) => s.addExpense);
  const updateExpense = useAppStore((s) => s.updateExpense);

  const initial = useMemo(
    () => initialFormState(group, expense, initialDraft),
    [group, expense, initialDraft],
  );

  const [description, setDescription] = useState(initial.description);
  const [amountRaw, setAmountRaw] = useState(initial.amountRaw);
  const [currency, setCurrency] = useState<CurrencyCode>(initial.currency);
  const [rateRaw, setRateRaw] = useState(initial.rateRaw);
  const [payerId, setPayerId] = useState<string>(initial.payerId);
  const [mode, setMode] = useState<SplitMode>(initial.mode);
  const [split, setSplit] = useState<SplitEntry[]>(initial.split);
  const [error, setError] = useState<string | null>(null);

  const handleCurrencyChange = (next: CurrencyCode) => {
    setCurrency(next);
    if (next === group.baseCurrency) {
      setRateRaw('');
    } else {
      const hint = group.rateHints[next];
      if (hint !== undefined) setRateRaw(String(hint));
      else setRateRaw('');
    }
  };

  const amountMinor = useMemo(() => parseAmountToMinor(amountRaw, currency) ?? 0, [amountRaw, currency]);
  const rate = useMemo(() => (currency === group.baseCurrency ? 1 : Number(rateRaw)), [rateRaw, currency, group]);
  const baseEquivalent = useMemo(() => {
    if (!amountMinor || !Number.isFinite(rate) || rate <= 0) return null;
    return convertMinor(amountMinor, currency, group.baseCurrency, rate);
  }, [amountMinor, currency, group.baseCurrency, rate]);

  const submit = () => {
    setError(null);
    const amtErr = validateAmountMinor(amountMinor);
    if (amtErr) return setError(amtErr);
    const rateErr = validateRate(rate, currency === group.baseCurrency);
    if (rateErr) return setError(rateErr);
    if (!payerId) return setError('Choose a payer.');
    const splitErr = validateSplit(mode, split, amountMinor);
    if (splitErr) return setError(splitErr);

    const input: ExpenseInput = {
      description: description.trim() || 'Expense',
      amountMinor,
      currency,
      rateToBase: rate,
      payerId,
      splitMode: mode,
      split,
    };
    if (expense) updateExpense(group.id, expense.id, input);
    else addExpense(group.id, input);
    onSaved?.();
    onClose();
  };

  const title = expense ? 'Edit expense' : 'New expense';

  return (
    <Dialog open={open} onClose={onClose} title={title} widthClass="max-w-xl">
      <div className="space-y-4">
        <div>
          <Label htmlFor="exp-desc">Description</Label>
          <Input
            id="exp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner at Izakaya"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label htmlFor="exp-amt">Amount</Label>
            <Input
              id="exp-amt"
              type="text"
              inputMode="decimal"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="exp-cur">Currency</Label>
            <Select
              id="exp-cur"
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCIES[c].symbol}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {currency !== group.baseCurrency && (
          <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2 rounded-md border border-ink-300 bg-ink-100/60 p-3">
            <span className="text-xs text-ink-600">1 {currency} =</span>
            <Input
              type="text"
              inputMode="decimal"
              value={rateRaw}
              onChange={(e) => setRateRaw(e.target.value)}
              placeholder="0.0066"
            />
            <span className="text-xs text-ink-600">{group.baseCurrency}</span>
            {baseEquivalent !== null && (
              <div className="col-span-3 text-xs text-ink-500">
                {formatMinor(amountMinor, currency)} × {rate} = {formatMinor(baseEquivalent, group.baseCurrency)}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="exp-payer">Paid by</Label>
          <Select id="exp-payer" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {group.members.length === 0 && <option value="">(add a member first)</option>}
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Split</Label>
          <SplitEditor
            mode={mode}
            members={group.members}
            split={split}
            amountMinor={amountMinor}
            currency={currency}
            onModeChange={setMode}
            onSplitChange={setSplit}
          />
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {expense ? 'Save' : 'Add expense'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
