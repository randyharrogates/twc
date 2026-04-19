import { z } from 'zod/v3';
import type { CurrencyCode, Group } from '../../../types';
import { CURRENCY_CODES } from '../../currency';
import type { RatePrompter } from '../agent';
import { toJsonSchema } from '../schema';
import { toolErr, toolOk, type ToolExecutionResult, type ToolSpec } from './registry';

const currencyEnum = CURRENCY_CODES as [typeof CURRENCY_CODES[number], ...typeof CURRENCY_CODES];

const LookupFxRateInputSchema = z
  .object({
    from: z.enum(currencyEnum),
    to: z.enum(currencyEnum),
  })
  .strict();

export interface LookupFxRateDeps {
  ratePrompter: RatePrompter;
  setRateHint: (groupId: string, code: CurrencyCode, rate: number) => void;
}

export function lookupFxRateTool(): ToolSpec {
  return {
    name: 'lookup_fx_rate',
    description:
      'Ask the user for the FX rate (1 unit of `from` → rate units of `to`). `to` must equal the group baseCurrency. Returns {rate, source} where source is "user" (user entered), "rateHints" (fallback to stored hint), "identity" (from===to), or null (unknown).',
    inputSchema: toJsonSchema(LookupFxRateInputSchema) as Record<string, unknown>,
    mutating: false,
  };
}

export async function executeLookupFxRate(
  group: Group,
  input: unknown,
  deps: LookupFxRateDeps,
): Promise<ToolExecutionResult> {
  const parsed = LookupFxRateInputSchema.safeParse(input);
  if (!parsed.success) return toolErr(parsed.error.issues.map((i) => i.message).join('; '));
  if (parsed.data.to !== group.baseCurrency) {
    return toolErr(
      `lookup_fx_rate.to must equal the group baseCurrency (${group.baseCurrency}); got ${parsed.data.to}.`,
    );
  }
  if (parsed.data.from === parsed.data.to) {
    return toolOk(JSON.stringify({ rate: 1, source: 'identity' }));
  }
  const suggested = group.rateHints[parsed.data.from];
  const { rate } = await deps.ratePrompter.requestRate({
    from: parsed.data.from,
    to: parsed.data.to,
    suggested: typeof suggested === 'number' && suggested > 0 ? suggested : undefined,
  });
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    deps.setRateHint(group.id, parsed.data.from, rate);
    return toolOk(JSON.stringify({ rate, source: 'user' }));
  }
  const hint = group.rateHints[parsed.data.from];
  if (typeof hint === 'number' && hint > 0) {
    return toolOk(JSON.stringify({ rate: hint, source: 'rateHints' }));
  }
  return toolOk(JSON.stringify({ rate: null, source: null }));
}
