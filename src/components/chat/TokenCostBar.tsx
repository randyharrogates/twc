import { useMemo, useState } from 'react';
import { microUsdToUsd } from '../../lib/llm/cost';
import { useCostTracker, usePolicy, useSettings } from '../../state/store';
import { dayKey } from '../../lib/llm/cost';

function last30Days(nowMs: number): string[] {
  const out: string[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let i = 29; i >= 0; i--) {
    out.push(dayKey(nowMs - i * DAY_MS));
  }
  return out;
}

export function TokenCostBar() {
  const tracker = useCostTracker();
  const policy = usePolicy();
  const settings = useSettings();
  const [now] = useState(() => Date.now());
  const todayKey = dayKey(now);
  const todayMicros = tracker.dailyUsdMicros[todayKey] ?? 0;
  const cap = policy.dailyCapUsdMicros;
  const isLocal = settings.llmProvider === 'local';

  const pct = cap > 0 ? Math.min(1, todayMicros / cap) : 0;
  const barColor = pct >= 1 ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-400' : 'bg-accent-500';

  const days = useMemo(() => last30Days(now), [now]);
  const max = useMemo(() => {
    let m = 0;
    for (const k of days) m = Math.max(m, tracker.dailyUsdMicros[k] ?? 0);
    return m;
  }, [days, tracker.dailyUsdMicros]);

  return (
    <div className="rounded-xl border border-ink-300 bg-ink-100/50 px-3 py-2 text-xs text-ink-700">
      <div className="flex items-center justify-between">
        <span>
          {isLocal ? (
            <>
              <strong className="font-mono text-ink-800">$0.00</strong>
              <span className="mx-1 text-ink-500">(local)</span>
            </>
          ) : (
            <>
              <strong className="font-mono text-ink-800">${microUsdToUsd(todayMicros).toFixed(4)}</strong>
              <span className="mx-1 text-ink-500">today</span>
              <span className="text-ink-500">
                / ${microUsdToUsd(cap).toFixed(2)} cap
              </span>
            </>
          )}
        </span>
        <span className="text-ink-500">{isLocal ? '—' : `${Math.round(pct * 100)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
        <div className={`h-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-2 flex items-end gap-0.5 h-6" aria-label="Spend over last 30 days">
        {days.map((k) => {
          const v = tracker.dailyUsdMicros[k] ?? 0;
          const h = max > 0 ? Math.max(2, Math.round((v / max) * 24)) : 2;
          return (
            <div
              key={k}
              className={`flex-1 ${v > 0 ? 'bg-accent-500/70' : 'bg-ink-200'}`}
              style={{ height: `${h}px` }}
              title={`${k}: $${microUsdToUsd(v).toFixed(4)}`}
            />
          );
        })}
      </div>
    </div>
  );
}
