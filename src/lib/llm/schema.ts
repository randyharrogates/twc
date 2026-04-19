import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CurrencyCode } from '../../types';

type JsonSchemaNode = Record<string, unknown> & { [key: string]: unknown };

export const ExpenseDraftSchema = (memberIds: string[], currencyCodes: CurrencyCode[]) => {
  const memberSet = new Set(memberIds);
  const currencyEnum = currencyCodes as [CurrencyCode, ...CurrencyCode[]];
  return z
    .object({
      description: z.string().min(1).max(200),
      amountMinor: z.number().int().min(1),
      currency: z.enum(currencyEnum),
      rateToBase: z.number().positive().finite(),
      payerId: z.string().refine((id) => memberSet.has(id), { message: 'payerId must be one of the group member ids.' }),
      splitMode: z.enum(['even', 'shares', 'exact', 'percent']),
      split: z.array(
        z
          .object({
            memberId: z.string().refine((id) => memberSet.has(id), {
              message: 'split.memberId must be one of the group member ids.',
            }),
            value: z.number().nonnegative().finite(),
          })
          .strict(),
      ),
      unresolvedNames: z.array(z.string()),
    })
    .strict();
};

export const AssistantResponseSchema = (memberIds: string[], currencyCodes: CurrencyCode[]) =>
  z
    .object({
      assistantText: z.string(),
      drafts: z.array(ExpenseDraftSchema(memberIds, currencyCodes)),
    })
    .strict();

export function toJsonSchema(schema: z.ZodTypeAny): JsonSchemaNode {
  const raw = zodToJsonSchema(schema, { target: 'openAi' }) as JsonSchemaNode;
  delete raw.$schema;
  const strict = enforceStrictObjects(raw);
  walkSchema(strict, rewriteExclusiveBounds);
  return strict;
}

function rewriteExclusiveBounds(node: Record<string, unknown>): void {
  if (node.exclusiveMinimum === true && typeof node.minimum === 'number') {
    node.exclusiveMinimum = node.minimum;
    delete node.minimum;
  } else if (node.exclusiveMinimum === false) {
    delete node.exclusiveMinimum;
  }
  if (node.exclusiveMaximum === true && typeof node.maximum === 'number') {
    node.exclusiveMaximum = node.maximum;
    delete node.maximum;
  } else if (node.exclusiveMaximum === false) {
    delete node.exclusiveMaximum;
  }
}

function enforceStrictObjects(node: unknown): JsonSchemaNode {
  if (!isJsonObject(node)) return node as JsonSchemaNode;
  const out: JsonSchemaNode = { ...node };
  if (out.type === 'object') {
    out.additionalProperties = false;
    const props = out.properties as Record<string, unknown> | undefined;
    if (props) {
      const keys = Object.keys(props);
      const required = Array.isArray(out.required) ? new Set(out.required as string[]) : new Set<string>();
      for (const k of keys) {
        required.add(k);
        props[k] = enforceStrictObjects(props[k]);
      }
      out.required = Array.from(required);
      out.properties = props;
    }
  }
  if (out.type === 'array' && out.items) {
    out.items = enforceStrictObjects(out.items);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(out[key])) {
      out[key] = (out[key] as unknown[]).map(enforceStrictObjects);
    }
  }
  return out;
}

function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function walkSchema(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (!isJsonObject(node)) return;
  visit(node);
  if (isJsonObject(node.properties)) {
    for (const v of Object.values(node.properties)) walkSchema(v, visit);
  }
  if (node.items) walkSchema(node.items, visit);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(node[key])) {
      for (const sub of node[key] as unknown[]) walkSchema(sub, visit);
    }
  }
}
