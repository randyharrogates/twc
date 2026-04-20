import { useState } from 'react';
import { useAppStore, usePolicy, useSettings, useVaultUnlocked } from '../state/store';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { APIKeyHelpPanel } from './APIKeyHelpPanel';
import { SecurityPanel } from './SecurityPanel';
import { DEFAULT_MODEL_ID, MODELS, MODEL_IDS } from '../lib/llm/models';
import type { ModelId, ReasoningEffort } from '../lib/llm/types';
import type { Provider } from '../lib/policy';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'providers' | 'models' | 'policy';

export function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('providers');
  return (
    <Dialog open={open} onClose={onClose} title="Settings" widthClass="max-w-2xl">
      <div className="space-y-3">
        <div className="flex gap-1 border-b border-ink-200/60 text-xs">
          {(['providers', 'models', 'policy'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 uppercase tracking-widest transition-colors ${
                tab === t ? 'border-accent-500 text-accent-400' : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'policy' && <PolicyTab />}
      </div>
    </Dialog>
  );
}

function ProvidersTab() {
  const settings = useSettings();
  const policy = usePolicy();
  const vaultUnlocked = useVaultUnlocked();
  const setLLMProvider = useAppStore((s) => s.setLLMProvider);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const setAllowedProviders = useAppStore((s) => s.setAllowedProviders);
  const setReasoningEffort = useAppStore((s) => s.setReasoningEffort);

  const toggleAllowed = (provider: Provider) => {
    const allowed = new Set(policy.allowedProviders);
    if (allowed.has(provider)) allowed.delete(provider);
    else allowed.add(provider);
    setAllowedProviders(Array.from(allowed));
  };

  const activeModelId = settings.modelOverride ?? DEFAULT_MODEL_ID[settings.llmProvider];
  const reasoningKind = MODELS[activeModelId].reasoningKind;
  const vaultLocked = settings.vault !== null && !vaultUnlocked;

  return (
    <div className="space-y-4 text-sm">
      <SecurityPanel />
      <div>
        <Label htmlFor="llm-provider">Active provider</Label>
        <Select
          id="llm-provider"
          value={settings.llmProvider}
          onChange={(e) => setLLMProvider(e.target.value as Provider)}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="reasoning-effort">Reasoning level</Label>
        <Select
          id="reasoning-effort"
          value={settings.reasoningEffort}
          disabled={reasoningKind === 'none'}
          onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
        >
          {reasoningKind !== 'intrinsic' && <option value="off">Off</option>}
          <option value="minimal">Minimal</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <div className="mt-1 text-xs text-ink-500">
          {reasoningKind === 'none'
            ? 'Select a reasoning-capable model (GPT-5 family or Claude 4.x) to enable.'
            : reasoningKind === 'intrinsic'
              ? 'GPT-5 always reasons; pick how much effort to spend.'
              : 'Extended thinking is opt-in for Claude 4.x; choose Off to disable.'}
        </div>
      </div>
      {(['anthropic', 'openai'] as Provider[]).map((p) => (
        <ProviderKeyRow
          key={p}
          provider={p}
          apiKey={settings.apiKeys[p] ?? ''}
          allowed={policy.allowedProviders.includes(p)}
          vaultLocked={vaultLocked}
          onSetKey={(k) => setApiKey(p, k)}
          onClearKey={() => clearApiKey(p)}
          onToggleAllowed={() => toggleAllowed(p)}
        />
      ))}
    </div>
  );
}

interface RowProps {
  provider: Provider;
  apiKey: string;
  allowed: boolean;
  vaultLocked: boolean;
  onSetKey: (key: string) => Promise<void>;
  onClearKey: () => void;
  onToggleAllowed: () => void;
}

function ProviderKeyRow({
  provider,
  apiKey,
  allowed,
  vaultLocked,
  onSetKey,
  onClearKey,
  onToggleAllowed,
}: RowProps) {
  const [revealed, setRevealed] = useState(false);
  const stored = apiKey;
  const storedIsEncrypted = stored.startsWith('enc.v1.');
  const displayValue = storedIsEncrypted ? '' : stored;
  const [draft, setDraft] = useState(displayValue);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [clearStatus, setClearStatus] = useState<'idle' | 'cleared'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const label = provider === 'anthropic' ? 'Anthropic' : 'OpenAI';

  const flashSaved = () => {
    setSaveStatus('saved');
    window.setTimeout(() => setSaveStatus('idle'), 1500);
  };
  const flashCleared = () => {
    setClearStatus('cleared');
    window.setTimeout(() => setClearStatus('idle'), 1500);
  };

  const placeholder = storedIsEncrypted
    ? 'Encrypted key stored — paste a new key to replace'
    : provider === 'anthropic'
      ? 'sk-ant-…'
      : 'sk-…';

  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSetKey(draft.trim());
      flashSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-ink-300 bg-ink-100/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-sm tracking-wide text-ink-800">{label}</div>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" checked={allowed} onChange={onToggleAllowed} />
          Allow this provider
        </label>
      </div>
      {storedIsEncrypted && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
          Key stored encrypted at rest (AES-GCM). Paste a new value to replace it.
        </div>
      )}
      <div>
        <Label htmlFor={`${provider}-key`}>API key</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${provider}-key`}
            type={revealed ? 'text' : 'password'}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setRevealed(false)}
          />
          <Button size="sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? 'Hide' : 'Reveal'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={vaultLocked && draft.trim().length > 0}
            title={
              vaultLocked && draft.trim().length > 0
                ? 'Unlock the vault in Security before saving a new key.'
                : undefined
            }
            onClick={() => void handleSave()}
          >
            {saveStatus === 'saved' ? 'Saved ✓' : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setDraft('');
              onClearKey();
              flashCleared();
            }}
          >
            {clearStatus === 'cleared' ? 'Cleared ✓' : 'Clear key'}
          </Button>
        </div>
        {saveError && (
          <div
            role="alert"
            className="mt-2 rounded-md border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          >
            {saveError}
          </div>
        )}
      </div>
      <APIKeyHelpPanel provider={provider} />
    </div>
  );
}

function ModelsTab() {
  const settings = useSettings();
  const setModelOverride = useAppStore((s) => s.setModelOverride);
  const setRetryConfig = useAppStore((s) => s.setRetryConfig);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="model-override">Model override</Label>
        <Select
          id="model-override"
          value={settings.modelOverride ?? ''}
          onChange={(e) => setModelOverride((e.target.value || null) as ModelId | null)}
        >
          <option value="">(auto: provider default)</option>
          {MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {MODELS[id].displayName} — {MODELS[id].provider}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="retry-count">Max retries (5xx)</Label>
          <Input
            id="retry-count"
            type="number"
            min={0}
            max={10}
            value={settings.retryConfig.maxRetries}
            onChange={(e) =>
              setRetryConfig({
                maxRetries: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                baseDelayMs: settings.retryConfig.baseDelayMs,
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="retry-delay">Backoff base (ms)</Label>
          <Input
            id="retry-delay"
            type="number"
            min={0}
            max={10_000}
            step={100}
            value={settings.retryConfig.baseDelayMs}
            onChange={(e) =>
              setRetryConfig({
                maxRetries: settings.retryConfig.maxRetries,
                baseDelayMs: Math.max(0, Math.min(10_000, Number(e.target.value) || 0)),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function PolicyTab() {
  const policy = usePolicy();
  const setDailyCap = useAppStore((s) => s.setDailyCap);
  const setMonthlyCap = useAppStore((s) => s.setMonthlyCap);
  const setPersistHistory = useAppStore((s) => s.setPersistHistory);
  const grantImageConsent = useAppStore((s) => s.grantImageConsent);
  const resetPolicy = useAppStore((s) => s.resetPolicy);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="daily-cap">Daily spend cap (USD)</Label>
          <Input
            id="daily-cap"
            type="number"
            min={0}
            step={0.5}
            value={(policy.dailyCapUsdMicros / 1_000_000).toFixed(2)}
            onChange={(e) => setDailyCap(Math.round(Number(e.target.value) * 1_000_000))}
          />
        </div>
        <div>
          <Label htmlFor="monthly-cap">Monthly spend cap (USD)</Label>
          <Input
            id="monthly-cap"
            type="number"
            min={0}
            step={1}
            value={(policy.monthlyCapUsdMicros / 1_000_000).toFixed(2)}
            onChange={(e) => setMonthlyCap(Math.round(Number(e.target.value) * 1_000_000))}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={policy.persistHistory}
          onChange={(e) => setPersistHistory(e.target.checked)}
        />
        Persist conversation history across reloads
      </label>
      <div className="rounded-xl border border-ink-300 bg-ink-100/40 p-3">
        <div className="font-display text-[10px] uppercase tracking-widest text-ink-500">
          Image consent
        </div>
        {(['anthropic', 'openai'] as Provider[]).map((p) => (
          <div key={p} className="mt-1 flex items-center justify-between text-xs">
            <span>
              {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}:{' '}
              <span className={policy.imageConsentByProvider[p] ? 'text-emerald-300' : 'text-amber-300'}>
                {policy.imageConsentByProvider[p] ? 'granted' : 'not granted'}
              </span>
            </span>
            {!policy.imageConsentByProvider[p] && (
              <GrantConsentButton onGrant={() => grantImageConsent(p)} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="danger" onClick={resetPolicy}>
          Reset policy defaults
        </Button>
      </div>
    </div>
  );
}

function GrantConsentButton({ onGrant }: { onGrant: () => void }) {
  const [status, setStatus] = useState<'idle' | 'granted'>('idle');
  return (
    <Button
      size="sm"
      onClick={() => {
        onGrant();
        setStatus('granted');
        window.setTimeout(() => setStatus('idle'), 1500);
      }}
    >
      {status === 'granted' ? 'Granted ✓' : 'Grant'}
    </Button>
  );
}
