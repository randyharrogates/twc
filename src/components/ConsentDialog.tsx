import { useState } from 'react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import type { Provider } from '../lib/policy';

interface Props {
  provider: Provider;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  local: 'Local',
};

export function ConsentDialog({ provider, open, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState(false);
  const isLocal = provider === 'local';

  return (
    <Dialog open={open} onClose={onCancel} title={`Send images to ${LABEL[provider]}?`} widthClass="max-w-md">
      <div className="space-y-3 text-sm text-ink-700">
        {isLocal ? (
          <p>
            TWC will send this receipt image to the <strong>Base URL</strong> you configured under
            Settings → Providers → Local. Only accept if you trust the server at that address.
          </p>
        ) : (
          <p>
            This image, along with your notes and conversation history, will be sent to{' '}
            <strong>{LABEL[provider]}</strong>. Receipts often contain names, addresses, partial card
            numbers, and timestamps. {LABEL[provider]} stores and processes this data per its own
            terms.
          </p>
        )}
        <p className="text-xs text-ink-500">
          You can revoke this consent in Settings → Policy at any time. Consent is tracked separately
          for each provider.
        </p>
        <label className="flex items-start gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {isLocal
              ? 'I understand this image will be sent to my configured local server.'
              : `I understand this image will be sent to ${LABEL[provider]} and may contain personal information.`}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!checked} onClick={onConfirm}>
            Consent &amp; send
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
