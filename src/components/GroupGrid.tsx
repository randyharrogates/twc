import { useState } from 'react';
import { useAppStore } from '../state/store';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../lib/currency';
import { GroupCard } from './GroupCard';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { SectionReveal } from './ui/SectionReveal';
import { Plus } from './ui/icons';

export function GroupGrid() {
  const groups = useAppStore((s) => s.groups);
  const order = useAppStore((s) => s.groupOrder);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const setActive = useAppStore((s) => s.setActiveGroup);
  const createGroup = useAppStore((s) => s.createGroup);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  const submit = () => {
    if (!name.trim()) return;
    const id = createGroup(name.trim(), currency);
    setActive(id);
    setName('');
    setCurrency('USD');
    setDialogOpen(false);
    setTimeout(() => {
      document.getElementById('expenses')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  const selectGroup = (id: string) => {
    setActive(id);
    setTimeout(() => {
      document.getElementById('expenses')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  return (
    <SectionReveal id="groups" className="min-h-screen px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <p className="font-script text-lg text-accent-400">step one</p>
            <h2 className="font-display text-5xl tracking-wide text-ink-800 md:text-6xl">GROUPS</h2>
          </div>
          <div className="text-sm text-ink-500">
            {order.length} group{order.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((id) => {
            const g = groups[id];
            if (!g) return null;
            return (
              <GroupCard
                key={id}
                group={g}
                active={id === activeGroupId}
                onClick={() => selectGroup(id)}
              />
            );
          })}

          <button
            onClick={() => setDialogOpen(true)}
            className="group flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-transparent text-ink-500 transition-colors hover:border-accent-500/70 hover:text-accent-400"
          >
            <Plus className="h-8 w-8" />
            <span className="mt-2 font-display text-sm tracking-widest">NEW GROUP</span>
          </button>
        </div>
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="New group">
        <div className="space-y-3">
          <div>
            <Label htmlFor="grp-name">Name</Label>
            <Input
              id="grp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo Trip"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="grp-cur">Base currency</Label>
            <Select
              id="grp-cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCIES[c].name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </SectionReveal>
  );
}
