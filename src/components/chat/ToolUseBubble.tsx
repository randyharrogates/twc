import { useState } from 'react';

interface Props {
  name: string;
  input: unknown;
  output?: string;
  isError?: boolean;
}

function summary(name: string, input: unknown): string {
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).slice(0, 2);
    const kv = entries
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    return `${name}(${kv})`;
  }
  return name;
}

export function ToolUseBubble({ name, input, output, isError }: Props) {
  const [open, setOpen] = useState(false);
  const color = isError
    ? 'border-red-400/40 bg-red-500/10 text-red-300'
    : 'border-ink-300 bg-ink-100/40 text-ink-600';
  return (
    <div
      className={`w-full max-w-[85%] self-start rounded-md border px-2.5 py-1.5 text-[11px] font-mono ${color}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span aria-hidden>🔧 </span>
          {summary(name, input)}
        </span>
        <span className="text-ink-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ink-100/60 p-1.5 text-ink-700">
            {JSON.stringify(input, null, 2)}
          </pre>
          {output !== undefined && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ink-100/60 p-1.5 text-ink-700">
              → {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
