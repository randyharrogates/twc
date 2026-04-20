import { useState } from 'react';
import { useAppStore } from '../state/store';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

interface Props {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  reason?: 'send' | 'save' | 'manual';
}

export function UnlockDialog({ open, onClose, onUnlocked, reason = 'manual' }: Props) {
  const unlockVault = useAppStore((s) => s.unlockVault);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassphrase('');
    setBusy(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (passphrase.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockVault(passphrase);
      setPassphrase('');
      setBusy(false);
      onUnlocked();
    } catch (err) {
      setBusy(false);
      const message = err instanceof Error ? err.message : 'Unlock failed.';
      setError(
        message.toLowerCase().includes('passphrase')
          ? 'That passphrase doesn’t match the one you set up. There’s no recovery — if you’ve forgotten it, close this dialog and click Wipe vault in Settings → Security.'
          : message,
      );
    }
  };

  const contextLine =
    reason === 'send'
      ? 'Enter your passphrase to decrypt the API key for this chat send.'
      : reason === 'save'
        ? 'Enter your passphrase to encrypt the new API key at rest.'
        : 'Enter the passphrase you set up earlier to unlock your API keys for this tab.';

  return (
    <Dialog open={open} onClose={close} title="Unlock passphrase vault">
      <div className="space-y-4 text-sm">
        <p className="text-ink-700">
          {contextLine} You’ll stay unlocked until you click <strong>Lock</strong> or close
          the tab.
        </p>
        <div>
          <Label htmlFor="unlock-passphrase">Passphrase</Label>
          <Input
            id="unlock-passphrase"
            autoFocus
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={busy}
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || passphrase.length === 0}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
