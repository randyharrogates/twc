import type { ModelId, TokenUsage } from './llm/types';
import { dayKey, monthKey } from './llm/cost';

export type Provider = 'anthropic' | 'openai' | 'local';

export interface Policy {
  allowedProviders: Provider[];
  dailyCapUsdMicros: number;
  monthlyCapUsdMicros: number;
  imageConsentByProvider: { anthropic: boolean; openai: boolean; local: boolean };
  persistHistory: boolean;
}

export interface CostTrackerSnapshot {
  dailyUsdMicros: Record<string, number>;
  monthlyUsdMicros: Record<string, number>;
  perMessage: Array<{
    messageId: string;
    usdMicros: number;
    tokens: TokenUsage;
    model: ModelId;
    at: number;
  }>;
}

export const DEFAULT_POLICY: Policy = {
  allowedProviders: [],
  dailyCapUsdMicros: 5_000_000,
  monthlyCapUsdMicros: 50_000_000,
  imageConsentByProvider: { anthropic: false, openai: false, local: false },
  persistHistory: true,
};

export type PolicyAction =
  | { kind: 'sendMessage'; provider: Provider; estCostMicros: number }
  | { kind: 'uploadImage'; provider: Provider }
  | { kind: 'persistHistory' };

export type PolicyDecision = { allow: true } | { allow: false; reason: string };

export function evaluatePolicy(
  action: PolicyAction,
  policy: Policy,
  costs: CostTrackerSnapshot,
  nowMs: number,
): PolicyDecision {
  switch (action.kind) {
    case 'sendMessage': {
      if (!policy.allowedProviders.includes(action.provider)) {
        return {
          allow: false,
          reason: `Provider "${action.provider}" is not enabled. Enable it in Settings → Providers.`,
        };
      }
      if (action.estCostMicros < 0) {
        return { allow: false, reason: 'Estimated cost is negative — refusing to send.' };
      }
      const today = costs.dailyUsdMicros[dayKey(nowMs)] ?? 0;
      if (today + action.estCostMicros > policy.dailyCapUsdMicros) {
        return {
          allow: false,
          reason: `This request would exceed the daily spend cap ($${(policy.dailyCapUsdMicros / 1_000_000).toFixed(2)}). Raise the cap in Settings → Policy or try again tomorrow.`,
        };
      }
      const month = costs.monthlyUsdMicros[monthKey(nowMs)] ?? 0;
      if (month + action.estCostMicros > policy.monthlyCapUsdMicros) {
        return {
          allow: false,
          reason: `This request would exceed the monthly spend cap ($${(policy.monthlyCapUsdMicros / 1_000_000).toFixed(2)}). Raise the cap in Settings → Policy.`,
        };
      }
      return { allow: true };
    }
    case 'uploadImage': {
      if (!policy.imageConsentByProvider[action.provider]) {
        return {
          allow: false,
          reason: `One-time consent required before sending images to ${action.provider}.`,
        };
      }
      return { allow: true };
    }
    case 'persistHistory': {
      if (!policy.persistHistory) {
        return { allow: false, reason: 'Conversation persistence is disabled in Settings → Policy.' };
      }
      return { allow: true };
    }
  }
}
