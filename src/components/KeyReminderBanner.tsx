import { useEffect, useState } from 'react';
import { useAppStore, useSettings, useVaultUnlocked } from '../state/store';
import { Button } from './ui/Button';

const DISMISS_KEY = 'twc-key-reminder-dismissed';

interface Props {
  onOpenSettings: () => void;
}

export function KeyReminderBanner({ onOpenSettings }: Props) {
  const settings = useSettings();
  const unlocked = useVaultUnlocked();
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const lockVault = useAppStore((s) => s.lockVault);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // sessionStorage unavailable (e.g. private mode); banner will redisplay on reload.
      }
    }
  }, [dismissed]);

  const hasAnyKey = Object.values(settings.apiKeys).some(
    (v) => typeof v === 'string' && v.length > 0,
  );
  if (!hasAnyKey || dismissed) return null;

  const hasPlaintext = Object.values(settings.apiKeys).some(
    (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('enc.v1.'),
  );
  const vaultExists = settings.vault !== null;

  if (!vaultExists && hasPlaintext) {
    const clearAll = () => {
      clearApiKey('anthropic');
      clearApiKey('openai');
      setDismissed(true);
    };
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-400/40 bg-amber-500/10 px-6 py-3 text-xs text-amber-200">
        <div className="flex-1 min-w-[280px]">
          <div className="font-display uppercase tracking-widest text-[10px] text-amber-300/90">
            Key stored in plaintext
          </div>
          <div className="mt-1 leading-relaxed">
            Your API key is stored in plaintext on a shared-origin host (
            <code>randyharrogates.github.io</code>). Other GitHub Pages sites under this user
            can read it. Set up a passphrase to encrypt it at rest, or clear it when done.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={onOpenSettings}>
            Set up passphrase
          </Button>
          <Button size="sm" variant="danger" onClick={clearAll}>
            Clear key
          </Button>
          <Button size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  if (vaultExists && unlocked) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-400/40 bg-emerald-500/10 px-6 py-3 text-xs text-emerald-200">
        <div className="flex-1 min-w-[280px]">
          <div className="font-display uppercase tracking-widest text-[10px] text-emerald-300/90">
            Vault unlocked
          </div>
          <div className="mt-1 leading-relaxed">
            Your API key vault is unlocked for this tab. Lock it when you step away.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={lockVault}>
            Lock now
          </Button>
          <Button size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
