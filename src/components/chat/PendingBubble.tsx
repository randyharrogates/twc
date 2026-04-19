import { useEffect, useState } from 'react';
import type { AgentPhase } from '../../lib/llm/types';

interface Props {
  text: string;
  phase?: AgentPhase | null;
  turnStartedAt: number;
  phaseStartedAt: number;
}

function phaseLabel(phase: AgentPhase | null | undefined): string | null {
  if (!phase) return null;
  if (phase.kind === 'starting' || phase.kind === 'thinking') return 'thinking…';
  if (phase.kind === 'calling_tool') {
    switch (phase.name) {
      case 'resolve_name':
        return 'resolving name…';
      case 'resolve_payer':
        return 'asking who paid…';
      case 'lookup_fx_rate':
        return 'looking up FX rate…';
      case 'add_member':
        return 'adding member…';
      case 'submit_drafts':
        return 'preparing drafts…';
      default:
        return `calling ${phase.name}…`;
    }
  }
  return null;
}

export function PendingBubble({ text, phase, turnStartedAt, phaseStartedAt }: Props) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, []);

  const label = phaseLabel(phase);
  const phaseSeconds = Math.max(0, (now - phaseStartedAt) / 1000);
  const totalSeconds = Math.max(0, (now - turnStartedAt) / 1000);
  const showTotal = phase != null && phase.kind !== 'starting';

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="status"
        aria-live="polite"
        aria-label="Assistant is responding"
        className="max-w-[85%] break-words rounded-2xl border border-ink-300 bg-ink-100/60 px-3 py-2 text-sm text-ink-800"
      >
        {label && (
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-500">
            {label} {phaseSeconds.toFixed(1)}s
            {showTotal && (
              <span className="ml-1 normal-case tracking-normal text-ink-500/80">
                (total {totalSeconds.toFixed(1)}s)
              </span>
            )}
          </div>
        )}
        {!label && (
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-500">
            thinking… {phaseSeconds.toFixed(1)}s
          </div>
        )}
        {text.length === 0 ? (
          <span className="inline-flex gap-1 align-middle" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-[pending-dot_1.2s_infinite] rounded-full bg-ink-500" />
            <span className="h-1.5 w-1.5 animate-[pending-dot_1.2s_infinite_0.2s] rounded-full bg-ink-500" />
            <span className="h-1.5 w-1.5 animate-[pending-dot_1.2s_infinite_0.4s] rounded-full bg-ink-500" />
          </span>
        ) : (
          <span className="whitespace-pre-wrap">
            {text}
            <span className="ml-0.5 inline-block animate-[pending-cursor_1s_steps(1)_infinite] align-middle">▍</span>
          </span>
        )}
      </div>
      <style>{`
        @keyframes pending-dot {
          0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes pending-cursor {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
