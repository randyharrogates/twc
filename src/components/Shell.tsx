import { useEffect, useState } from 'react';
import { useActiveGroup } from '../state/store';
import { BackgroundLayer } from './BackgroundLayer';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { GroupGrid } from './GroupGrid';
import { ExpensesSection } from './ExpensesSection';
import { SettlementSection } from './SettlementSection';
import { LLMAssistant } from './LLMAssistant';

export function Shell() {
  const group = useActiveGroup();
  const [llmOpen, setLlmOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (group) setLlmOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [group]);

  return (
    <div className="relative min-h-full">
      <BackgroundLayer />
      <Nav />
      <main>
        <Hero />
        <GroupGrid />
        <ExpensesSection group={group} onOpenLLM={() => setLlmOpen(true)} />
        <SettlementSection group={group} />
        <footer className="border-t border-ink-200/60 px-6 py-10 text-center text-xs text-ink-500">
          <p className="font-script text-base text-ink-600">a side quest in split-bill minimalism</p>
        </footer>
      </main>
      {group && <LLMAssistant group={group} open={llmOpen} onClose={() => setLlmOpen(false)} />}
    </div>
  );
}
