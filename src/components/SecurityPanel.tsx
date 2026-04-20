import { useState } from 'react';
import { useAppStore, useSettings, useVaultUnlocked } from '../state/store';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

type Status = 'uninitialized' | 'locked' | 'unlocked';

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<Status, { label: string; className: string }> = {
    unlocked: {
      label: 'Unlocked',
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    },
    locked: {
      label: 'Locked',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    },
    uninitialized: {
      label: 'Not configured',
      className: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    },
  };
  const { label, className } = cfg[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-display text-[10px] uppercase tracking-widest ${className}`}
    >
      {label}
    </span>
  );
}

export function SecurityPanel() {
  const settings = useSettings();
  const unlocked = useVaultUnlocked();
  const setupVault = useAppStore((s) => s.setupVault);
  const lockVault = useAppStore((s) => s.lockVault);

  const status: Status =
    settings.vault === null ? 'uninitialized' : unlocked ? 'unlocked' : 'locked';

  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);

  const hasPlaintextKey = Object.values(settings.apiKeys).some(
    (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('enc.v1.'),
  );

  return (
    <div className="space-y-3 rounded-xl border border-ink-300 bg-ink-100/40 p-3 text-xs text-ink-600">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[10px] uppercase tracking-widest text-ink-500">
          Passphrase vault
        </div>
        <StatusBadge status={status} />
      </div>

      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          Why a passphrase
        </div>
        <p className="leading-relaxed text-ink-700">
          This site is hosted on <code>randyharrogates.github.io</code>, which is shared with
          other GitHub Pages sites under the same user. Without a passphrase, any of those
          sites can read your stored API key. With one, your key is encrypted with AES-256
          derived from your passphrase — other pages see the encrypted blob but can’t use it.
          TWC never stores your passphrase; only a salt and a small probe used to check if
          you typed it correctly.
        </p>
      </section>

      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          How to set it up
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-ink-700">
          <li>Click <strong>Set up passphrase</strong>.</li>
          <li>
            Type a strong passphrase (the longer the better — a sentence works). Type it
            twice to confirm.
          </li>
          <li>Your existing API keys are encrypted in place immediately.</li>
          <li>
            When you reload the tab, you’ll be asked to unlock before sending chat messages.
          </li>
        </ol>
      </section>

      <section>
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-ink-500">
          If you forget your passphrase
        </div>
        <p className="leading-relaxed text-ink-700">
          There is no recovery. Click <strong>Wipe vault</strong> — it deletes the passphrase
          <em> and</em> the encrypted keys. You’ll need to paste your API keys again. This is
          by design; a recovery backdoor would defeat the encryption.
        </p>
      </section>

      {status === 'uninitialized' && hasPlaintextKey && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-200">
          <strong>Recommended:</strong> set up a passphrase to encrypt your API key at rest.
          Takes 10 seconds.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === 'uninitialized' && (
          <Button size="sm" variant="primary" onClick={() => setSetupOpen(true)}>
            Set up passphrase
          </Button>
        )}
        {status === 'locked' && (
          <Button size="sm" variant="primary" onClick={() => setUnlockOpen(true)}>
            Unlock
          </Button>
        )}
        {status === 'unlocked' && (
          <Button size="sm" onClick={lockVault}>
            Lock
          </Button>
        )}
        {status !== 'uninitialized' && (
          <Button size="sm" variant="danger" onClick={() => setWipeOpen(true)}>
            Wipe vault
          </Button>
        )}
      </div>

      <SetupVaultDialog open={setupOpen} onClose={() => setSetupOpen(false)} onSetup={setupVault} />
      <InlineUnlockDialog open={unlockOpen} onClose={() => setUnlockOpen(false)} />
      <WipeConfirmDialog open={wipeOpen} onClose={() => setWipeOpen(false)} />
    </div>
  );
}

function SetupVaultDialog({
  open,
  onClose,
  onSetup,
}: {
  open: boolean;
  onClose: () => void;
  onSetup: (passphrase: string) => Promise<void>;
}) {
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPass1('');
    setPass2('');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    if (pass1.length < 1 || busy) return;
    if (pass1 !== pass2) {
      setError('The two passphrases don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSetup(pass1);
      reset();
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Setup failed.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Set up passphrase vault"
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-700">
          Pick a passphrase that only you know. It’s used to derive an AES-256 key that
          encrypts your API keys at rest. There is no recovery — if you forget it, you’ll
          have to wipe the vault and re-paste your keys.
        </p>
        <div>
          <Label htmlFor="setup-pass-1">Passphrase</Label>
          <Input
            id="setup-pass-1"
            autoFocus
            type="password"
            autoComplete="new-password"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <Label htmlFor="setup-pass-2">Confirm passphrase</Label>
          <Input
            id="setup-pass-2"
            type="password"
            autoComplete="new-password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
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
          <Button
            size="sm"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || pass1.length === 0 || pass2.length === 0}
          >
            {busy ? 'Encrypting…' : 'Set up'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function InlineUnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unlockVault = useAppStore((s) => s.unlockVault);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (passphrase.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockVault(passphrase);
      setPassphrase('');
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Unlock failed.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Unlock passphrase vault">
      <div className="space-y-4 text-sm">
        <p className="text-ink-700">
          Enter the passphrase you set up earlier to unlock your API keys for this tab.
          You’ll stay unlocked until you click <strong>Lock</strong> or close the tab.
        </p>
        <div>
          <Label htmlFor="inline-unlock-pass">Passphrase</Label>
          <Input
            id="inline-unlock-pass"
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
            That passphrase doesn’t match the one you set up. There’s no recovery — if
            you’ve forgotten it, click <strong>Wipe vault</strong>.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose} disabled={busy}>
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

function WipeConfirmDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wipeVault = useAppStore((s) => s.wipeVault);
  return (
    <Dialog open={open} onClose={onClose} title="Wipe passphrase vault?">
      <div className="space-y-4 text-sm">
        <p className="text-ink-700">
          This deletes the passphrase, the salt, and <strong>all encrypted API keys</strong>.
          You will need to paste your keys again. There is no undo.
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              wipeVault();
              onClose();
            }}
          >
            Wipe vault
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
