import type { Provider } from '../lib/policy';

interface Props {
  provider: Provider;
}

interface Guide {
  label: string;
  url: string;
  steps: string[];
}

const GUIDES: Record<Provider, Guide> = {
  anthropic: {
    label: 'Anthropic',
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Open the Anthropic Console linked below and sign in.',
      'Go to Settings → API Keys.',
      'Click "Create Key", give it a name (e.g. "twc-personal"), copy the value.',
      'Paste it into the field in this tab. It only lives in this browser.',
    ],
  },
  openai: {
    label: 'OpenAI',
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'Open the OpenAI platform linked below and sign in.',
      'Go to Dashboard → API Keys.',
      'Click "Create new secret key", scope to "All", copy the value.',
      'Paste it into the field in this tab.',
    ],
  },
};

export function APIKeyHelpPanel({ provider }: Props) {
  const g = GUIDES[provider];
  return (
    <div className="space-y-3 rounded-xl border border-ink-300 bg-ink-100/40 p-3 text-xs text-ink-600">
      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          How to generate a {g.label} key
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-ink-700">
          {g.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <a
          href={g.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-block text-accent-400 underline decoration-dotted underline-offset-2 hover:text-accent-300"
        >
          {g.url}
        </a>
      </section>

      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          Security disclosure
        </div>
        <p className="leading-relaxed text-ink-700">
          Your key is stored in this browser&apos;s <code>localStorage</code>. Any script running on this
          origin — including a compromised npm dependency — could read it and use your account.
          Only paste a key for a personal account; never share a key. Monitor your provider&apos;s usage
          dashboard. Exports from this app redact the key, but an attacker with XSS on this origin can
          exfiltrate it directly.
        </p>
      </section>

      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          How to clear the key
        </div>
        <ul className="list-disc space-y-1 pl-5 text-ink-700">
          <li>Use the red &quot;Clear key&quot; button in this dialog.</li>
          <li>
            Or: browser DevTools → Application → Local Storage → <code>twc-v1</code> → remove the{' '}
            <code>settings.apiKeys.{provider}</code> entry.
          </li>
        </ul>
      </section>
    </div>
  );
}
