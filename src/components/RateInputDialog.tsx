import { useId, useState } from 'react';
import type { CurrencyCode } from '../types';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Input';

interface Props {
  open: boolean;
  from: CurrencyCode;
  to: CurrencyCode;
  suggested?: number;
  groupName: string;
  onSubmit: (rate: number) => void;
  onSkip: () => void;
}

export function RateInputDialog({ open, from, to, suggested, groupName, onSubmit, onSkip }: Props) {
  const inputId = useId();
  const [value, setValue] = useState<string>(suggested !== undefined ? String(suggested) : '');
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(value);
  const valid = value.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;

  const submit = () => {
    if (!valid) {
      setError('Enter a positive number.');
      return;
    }
    onSubmit(parsed);
  };

  return (
    <Dialog open={open} onClose={onSkip} title="FX rate needed" widthClass="max-w-md">
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          The assistant is about to convert <strong>{from}</strong> to <strong>{to}</strong> for
          group <em>{groupName}</em>.
        </p>
        <div className="flex items-center gap-2">
          <span className="font-medium">1 {from} =</span>
          <label htmlFor={inputId} className="sr-only">
            Rate from {from} to {to}
          </label>
          <Input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            className="max-w-[10rem]"
            autoFocus
          />
          <span className="font-medium">{to}</span>
        </div>
        {suggested !== undefined && (
          <p className="text-xs text-ink-500">Stored hint pre-filled — edit or submit as-is.</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onSkip}>Skip</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            Submit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
