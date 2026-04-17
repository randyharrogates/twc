import { useState } from 'react';
import type { Group } from '../types';
import { Button } from './ui/Button';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import { Gear } from './ui/icons';

interface Props {
  group: Group;
}

export function GroupHeader({ group }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex items-center justify-between border-b border-ink-200/60 pb-6">
      <div>
        <p className="font-script text-base text-accent-400">active group</p>
        <h3 className="font-display text-4xl tracking-wide text-ink-800">{group.name}</h3>
        <p className="mt-1 text-xs uppercase tracking-widest text-ink-500">
          base currency · {group.baseCurrency}
        </p>
      </div>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Gear className="h-3.5 w-3.5" />
        Settings
      </Button>
      <GroupSettingsDialog group={group} open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
