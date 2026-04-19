import { useEffect, useState } from 'react';
import { useActiveGroup } from '../state/store';
import { BackgroundLayer } from './BackgroundLayer';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { GroupGrid } from './GroupGrid';
import { ExpensesSection } from './ExpensesSection';
import { SettlementSection } from './SettlementSection';
import { ChatPanel } from './chat/ChatPanel';
import { SettingsDialog } from './SettingsDialog';
import { ConsentDialog } from './ConsentDialog';
import { ToolConfirmDialog } from './ToolConfirmDialog';
import { RateInputDialog } from './RateInputDialog';
import { PayerPromptDialog } from './PayerPromptDialog';
import { useAppStore } from '../state/store';
import type { Provider } from '../lib/policy';
import type { CurrencyCode, Member } from '../types';

interface PendingConsent {
  provider: Provider;
  resume: () => Promise<void>;
}

export interface PendingToolConsent {
  tool: string;
  input: unknown;
  groupName: string;
  resolve: (decision: 'allow' | 'deny') => void;
}

export interface PendingRateInput {
  from: CurrencyCode;
  to: CurrencyCode;
  suggested?: number;
  groupName: string;
  resolve: (result: { rate: number | null }) => void;
}

export interface PendingPayerPrompt {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  members: Member[];
  groupName: string;
  resolve: (result: { payerId: string | null }) => void;
}

export function Shell() {
  const group = useActiveGroup();
  const grantImageConsent = useAppStore((s) => s.grantImageConsent);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);
  const [pendingToolConsent, setPendingToolConsent] = useState<PendingToolConsent | null>(null);
  const [pendingRateInput, setPendingRateInput] = useState<PendingRateInput | null>(null);
  const [pendingPayerPrompt, setPendingPayerPrompt] = useState<PendingPayerPrompt | null>(null);

  const requestToolConsent = (req: { tool: string; input: unknown; groupName: string }): Promise<'allow' | 'deny'> =>
    new Promise((resolve) => {
      setPendingToolConsent({ ...req, resolve });
    });

  const requestRateInput = (req: {
    from: CurrencyCode;
    to: CurrencyCode;
    suggested?: number;
    groupName: string;
  }): Promise<{ rate: number | null }> =>
    new Promise((resolve) => {
      setPendingRateInput({ ...req, resolve });
    });

  const requestPayerPrompt = (req: {
    description: string;
    amountMinor: number;
    currency: CurrencyCode;
    members: Member[];
    groupName: string;
  }): Promise<{ payerId: string | null }> =>
    new Promise((resolve) => {
      setPendingPayerPrompt({ ...req, resolve });
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (group) setChatOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [group]);

  return (
    <div className="relative min-h-full">
      <BackgroundLayer />
      <Nav onOpenSettings={() => setSettingsOpen(true)} />
      <main>
        <Hero />
        <GroupGrid />
        <ExpensesSection group={group} onOpenLLM={() => setChatOpen(true)} />
        <SettlementSection group={group} />
        <footer className="border-t border-ink-200/60 px-6 py-10 text-center text-xs text-ink-500">
          <p className="font-script text-base text-ink-600">a side quest in split-bill minimalism</p>
        </footer>
      </main>
      {group && (
        <ChatPanel
          group={group}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onConsentNeeded={(provider, resume) => setPendingConsent({ provider, resume })}
          onToolConsentNeeded={requestToolConsent}
          onRateInputNeeded={(req) => requestRateInput({ ...req, groupName: group.name })}
          onPayerPromptNeeded={(req) =>
            requestPayerPrompt({ ...req, groupName: group.name })
          }
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {pendingConsent && (
        <ConsentDialog
          provider={pendingConsent.provider}
          open
          onConfirm={() => {
            grantImageConsent(pendingConsent.provider);
            const resume = pendingConsent.resume;
            setPendingConsent(null);
            void resume();
          }}
          onCancel={() => setPendingConsent(null)}
        />
      )}
      {pendingToolConsent && (
        <ToolConfirmDialog
          tool={pendingToolConsent.tool}
          input={pendingToolConsent.input}
          groupName={pendingToolConsent.groupName}
          open
          onAllow={() => {
            const r = pendingToolConsent.resolve;
            setPendingToolConsent(null);
            r('allow');
          }}
          onDeny={() => {
            const r = pendingToolConsent.resolve;
            setPendingToolConsent(null);
            r('deny');
          }}
        />
      )}
      {pendingRateInput && (
        <RateInputDialog
          open
          from={pendingRateInput.from}
          to={pendingRateInput.to}
          suggested={pendingRateInput.suggested}
          groupName={pendingRateInput.groupName}
          onSubmit={(rate) => {
            const r = pendingRateInput.resolve;
            setPendingRateInput(null);
            r({ rate });
          }}
          onSkip={() => {
            const r = pendingRateInput.resolve;
            setPendingRateInput(null);
            r({ rate: null });
          }}
        />
      )}
      {pendingPayerPrompt && (
        <PayerPromptDialog
          open
          description={pendingPayerPrompt.description}
          amountMinor={pendingPayerPrompt.amountMinor}
          currency={pendingPayerPrompt.currency}
          members={pendingPayerPrompt.members}
          groupName={pendingPayerPrompt.groupName}
          onPick={(payerId) => {
            const r = pendingPayerPrompt.resolve;
            setPendingPayerPrompt(null);
            r({ payerId });
          }}
          onCancel={() => {
            const r = pendingPayerPrompt.resolve;
            setPendingPayerPrompt(null);
            r({ payerId: null });
          }}
        />
      )}
    </div>
  );
}
