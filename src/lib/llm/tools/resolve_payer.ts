import { z } from 'zod/v3';
import type { Group } from '../../../types';
import { CURRENCY_CODES } from '../../currency';
import type { PayerPrompter } from '../agent';
import { toJsonSchema } from '../schema';
import { toolErr, toolOk, type ToolExecutionResult, type ToolSpec } from './registry';

const currencyEnum = CURRENCY_CODES as [typeof CURRENCY_CODES[number], ...typeof CURRENCY_CODES];

const ResolvePayerInputSchema = z
  .object({
    description: z.string().min(1).max(200),
    amountMinor: z.number().int().min(1),
    currency: z.enum(currencyEnum),
  })
  .strict();

export interface ResolvePayerDeps {
  payerPrompter: PayerPrompter;
}

export function resolvePayerTool(): ToolSpec {
  return {
    name: 'resolve_payer',
    description:
      'Ask the user which group member paid for this expense. Call this only when the payer is ambiguous or not named in the user message / receipt text. Returns {payerId} where payerId is a member id the user picked, or null if they cancel (in which case stop the tool loop and ask the user in plain text).',
    inputSchema: toJsonSchema(ResolvePayerInputSchema) as Record<string, unknown>,
    mutating: false,
  };
}

export async function executeResolvePayer(
  group: Group,
  input: unknown,
  deps: ResolvePayerDeps,
): Promise<ToolExecutionResult> {
  const parsed = ResolvePayerInputSchema.safeParse(input);
  if (!parsed.success) return toolErr(parsed.error.issues.map((i) => i.message).join('; '));
  const { payerId } = await deps.payerPrompter.requestPayer({
    description: parsed.data.description,
    amountMinor: parsed.data.amountMinor,
    currency: parsed.data.currency,
    members: group.members,
  });
  if (payerId === null) return toolOk(JSON.stringify({ payerId: null }));
  const found = group.members.some((m) => m.id === payerId);
  if (!found) {
    return toolErr(
      `resolve_payer returned a payerId ("${payerId}") that is not a member of the active group.`,
    );
  }
  return toolOk(JSON.stringify({ payerId }));
}
