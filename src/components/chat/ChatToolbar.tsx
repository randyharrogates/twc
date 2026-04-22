import { useEffect, useRef, useState } from 'react';
import { MODELS, MODEL_IDS } from '../../lib/llm/models';
import type { ModelId } from '../../lib/llm/types';
import type { Provider } from '../../lib/policy';

interface Props {
  modelId: ModelId;
  planMode: boolean;
  apiKeys: { anthropic?: string; openai?: string; local?: string };
  localConfigured: boolean;
  onSelectModel: (id: ModelId) => void;
  onTogglePlanMode: () => void;
  disabled?: boolean;
}

function groupByProvider(): Record<Provider, ModelId[]> {
  const out: Record<Provider, ModelId[]> = { anthropic: [], openai: [], local: [] };
  for (const id of MODEL_IDS) out[MODELS[id].provider].push(id);
  return out;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  local: 'Local',
};

export function ChatToolbar({
  modelId,
  planMode,
  apiKeys,
  localConfigured,
  onSelectModel,
  onTogglePlanMode,
  disabled = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const grouped = groupByProvider();
  const currentMeta = MODELS[modelId];

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className="flex flex-wrap items-center gap-2 text-xs"
      aria-label="Chat toolbar"
    >
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md border border-ink-300 bg-ink-100/50 px-2 py-1 text-ink-800 hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="font-medium">{currentMeta.displayName}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-ink-300 bg-ink-0 p-1 shadow-lg"
          >
            {(['anthropic', 'openai', 'local'] as Provider[]).map((provider) => (
              <div key={provider} className="py-1">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {PROVIDER_LABEL[provider]}
                </div>
                {grouped[provider].map((id) => {
                  const isLocal = provider === 'local';
                  const missing = isLocal ? !localConfigured : !apiKeys[provider];
                  const active = id === modelId;
                  const meta = MODELS[id];
                  return (
                    <button
                      key={id}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onSelectModel(id);
                        setMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-ink-100/70 ${
                        active ? 'bg-accent-500/10 text-accent-400' : 'text-ink-800'
                      }`}
                    >
                      <span>{meta.displayName}</span>
                      {missing ? (
                        <span className="text-[10px] text-amber-400">
                          {isLocal ? 'not configured' : 'no API key'}
                        </span>
                      ) : active ? (
                        <span aria-hidden="true">✓</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        role="group"
        aria-label="Mode"
        className="inline-flex overflow-hidden rounded-md border border-ink-300"
      >
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!planMode}
          onClick={() => {
            if (planMode) onTogglePlanMode();
          }}
          className={`px-2 py-1 text-xs transition ${
            !planMode
              ? 'bg-accent-500/20 text-accent-400'
              : 'bg-transparent text-ink-600 hover:text-ink-800'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Chat
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={planMode}
          onClick={() => {
            if (!planMode) onTogglePlanMode();
          }}
          className={`border-l border-ink-300 px-2 py-1 text-xs transition ${
            planMode
              ? 'bg-accent-500/20 text-accent-400'
              : 'bg-transparent text-ink-600 hover:text-ink-800'
          } disabled:cursor-not-allowed disabled:opacity-60`}
          title="Plan mode: read-only preview. Shift+Tab toggles."
        >
          Plan
        </button>
      </div>
      {planMode && (
        <span className="text-[10px] uppercase tracking-wider text-amber-400">
          read-only preview
        </span>
      )}
    </div>
  );
}
