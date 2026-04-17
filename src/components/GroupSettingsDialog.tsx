import { useMemo, useState } from 'react';
import { useAppStore } from '../state/store';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../lib/currency';
import type { Group } from '../types';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
}

export function GroupSettingsDialog({ group, open, onClose }: Props) {
  const renameGroup = useAppStore((s) => s.renameGroup);
  const changeBase = useAppStore((s) => s.changeBaseCurrency);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const exportState = useAppStore((s) => s.exportState);
  const resetAll = useAppStore((s) => s.resetAll);

  const [name, setName] = useState(group.name);
  const [newBase, setNewBase] = useState<CurrencyCode>(group.baseCurrency);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const needsRates = useMemo(() => {
    if (newBase === group.baseCurrency) return [] as CurrencyCode[];
    const set = new Set<CurrencyCode>();
    for (const e of group.expenses) if (e.currency !== newBase) set.add(e.currency);
    return [...set];
  }, [newBase, group]);

  const applyRename = () => {
    if (name.trim() !== group.name) renameGroup(group.id, name.trim());
  };

  const applyBaseChange = () => {
    setError(null);
    if (newBase === group.baseCurrency) return;
    const parsed: Partial<Record<CurrencyCode, number>> = {};
    for (const c of needsRates) {
      const raw = rates[c];
      const num = raw ? Number(raw) : NaN;
      if (!Number.isFinite(num) || num <= 0) {
        setError(`Enter a positive rate for ${c} → ${newBase}.`);
        return;
      }
      parsed[c] = num;
    }
    try {
      changeBase(group.id, newBase, parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const downloadExport = () => {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twc-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = () => {
    if (window.confirm(`Delete "${group.name}"? This cannot be undone.`)) {
      deleteGroup(group.id);
      onClose();
    }
  };

  const confirmReset = () => {
    if (window.confirm('Reset ALL groups, members, and expenses? This cannot be undone.')) {
      resetAll();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Group settings">
      <div className="space-y-4">
        <section className="space-y-2">
          <Label htmlFor="grp-rename">Name</Label>
          <div className="flex gap-2">
            <Input
              id="grp-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button onClick={applyRename} disabled={!name.trim() || name.trim() === group.name}>
              Save
            </Button>
          </div>
        </section>

        <section className="space-y-2 border-t border-ink-200/60 pt-4">
          <Label htmlFor="grp-newbase">Base currency</Label>
          <Select
            id="grp-newbase"
            value={newBase}
            onChange={(e) => setNewBase(e.target.value as CurrencyCode)}
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c} · {CURRENCIES[c].name}
              </option>
            ))}
          </Select>
          {needsRates.length > 0 && (
            <div className="space-y-2 rounded-md border border-ink-300 bg-ink-100/60 p-3">
              <div className="text-xs text-ink-600">
                Enter conversion rates from each currency into the new base ({newBase}):
              </div>
              {needsRates.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="w-28 text-xs text-ink-600">1 {c} =</span>
                  <Input
                    value={rates[c] ?? ''}
                    onChange={(e) => setRates({ ...rates, [c]: e.target.value })}
                    placeholder="0.0066"
                  />
                  <span className="w-16 text-xs text-ink-500">{newBase}</span>
                </div>
              ))}
            </div>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={applyBaseChange}
              disabled={newBase === group.baseCurrency}
            >
              Change base currency
            </Button>
          </div>
        </section>

        <section className="space-y-2 border-t border-ink-200/60 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadExport}>Export JSON</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete group</Button>
            <Button variant="danger" onClick={confirmReset}>Reset all data</Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
