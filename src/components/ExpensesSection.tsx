import type { Group } from '../types';
import { GroupHeader } from './GroupHeader';
import { MembersPanel } from './MembersPanel';
import { ExpenseList } from './ExpenseList';
import { SectionReveal } from './ui/SectionReveal';

interface Props {
  group: Group | null;
  onOpenLLM: () => void;
}

export function ExpensesSection({ group, onOpenLLM }: Props) {
  return (
    <SectionReveal id="expenses" className="min-h-screen px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12">
          <p className="font-script text-lg text-accent-400">step two</p>
          <h2 className="font-display text-5xl tracking-wide text-ink-800 md:text-6xl">EXPENSES</h2>
        </div>

        {!group ? (
          <EmptyState message="Pick a group above to start tracking expenses." />
        ) : (
          <div className="space-y-8">
            <GroupHeader group={group} />
            <MembersPanel group={group} />
            <ExpenseList group={group} onOpenLLM={onOpenLLM} />
          </div>
        )}
      </div>
    </SectionReveal>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-100/30 px-8 py-20 text-center">
      <p className="font-script text-2xl text-ink-500">← {message}</p>
    </div>
  );
}
