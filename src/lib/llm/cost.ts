import type { Model } from './models';
import type { TokenUsage } from './types';

export function usageToMicroUsd(usage: TokenUsage, model: Model): number {
  const input = Math.round((usage.inputTokens * model.priceInputMicrosPerMillion) / 1_000_000);
  const output = Math.round((usage.outputTokens * model.priceOutputMicrosPerMillion) / 1_000_000);
  return input + output;
}

export function microUsdToUsd(micros: number): number {
  return micros / 1_000_000;
}

export function dayKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
