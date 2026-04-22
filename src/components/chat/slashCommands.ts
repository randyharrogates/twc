import { MODELS, isModelId } from '../../lib/llm/models';
import type { ModelId } from '../../lib/llm/types';
import type { Provider } from '../../lib/policy';

export interface SlashDeps {
  currentModelId: ModelId;
  planMode: boolean;
  apiKeys: { anthropic?: string; openai?: string; local?: string };
  localConfigured: boolean;
  setModelOverride: (id: ModelId | null) => void;
  setLLMProvider: (provider: Provider) => void;
  setPlanMode: (v: boolean) => void;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  local: 'Local',
};

export type SlashResult =
  | { handled: false }
  | { handled: true; kind: 'success' | 'error'; message: string };

export function dispatchSlashCommand(raw: string, deps: SlashDeps): SlashResult {
  const text = raw.trim();
  if (!text.startsWith('/')) return { handled: false };
  const [head, ...rest] = text.slice(1).split(/\s+/);
  const cmd = head.toLowerCase();
  const arg = rest.join(' ').trim();

  if (cmd === 'plan') return handlePlan(arg, deps);
  if (cmd === 'model') return handleModel(arg, deps);
  return {
    handled: true,
    kind: 'error',
    message: `Unknown command "/${cmd}". Known: /plan [on|off|toggle], /model [<id>].`,
  };
}

function handlePlan(arg: string, deps: SlashDeps): SlashResult {
  const token = arg.toLowerCase();
  if (token === '' || token === 'toggle') {
    const next = !deps.planMode;
    deps.setPlanMode(next);
    return { handled: true, kind: 'success', message: next ? 'Plan mode on.' : 'Plan mode off.' };
  }
  if (token === 'on') {
    deps.setPlanMode(true);
    return { handled: true, kind: 'success', message: 'Plan mode on.' };
  }
  if (token === 'off') {
    deps.setPlanMode(false);
    return { handled: true, kind: 'success', message: 'Plan mode off.' };
  }
  return {
    handled: true,
    kind: 'error',
    message: `/plan expects no arg, "on", "off", or "toggle" — got "${arg}".`,
  };
}

function handleModel(arg: string, deps: SlashDeps): SlashResult {
  if (arg === '') {
    const meta = MODELS[deps.currentModelId];
    return {
      handled: true,
      kind: 'success',
      message: `Current model: ${deps.currentModelId} (${meta.displayName}, ${meta.provider}).`,
    };
  }
  if (!isModelId(arg)) {
    return {
      handled: true,
      kind: 'error',
      message: `Unknown model "${arg}". Known ids: ${Object.keys(MODELS).join(', ')}.`,
    };
  }
  const meta = MODELS[arg];
  deps.setModelOverride(arg);
  deps.setLLMProvider(meta.provider);
  const providerLabel = PROVIDER_LABEL[meta.provider];
  const isLocal = meta.provider === 'local';
  const missing = isLocal ? !deps.localConfigured : !deps.apiKeys[meta.provider];
  if (!missing) {
    return {
      handled: true,
      kind: 'success',
      message: `Switched to ${meta.displayName} (${providerLabel}).`,
    };
  }
  return {
    handled: true,
    kind: 'success',
    message: isLocal
      ? `Switched to ${meta.displayName} (Local) — set the Base URL and model name in Settings to send.`
      : `Switched to ${meta.displayName} (${providerLabel}) — add an API key in Settings to send.`,
  };
}
