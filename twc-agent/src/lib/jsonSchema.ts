import { z, type ZodType } from 'zod';

type JsonSchemaNode = Record<string, unknown> & { [key: string]: unknown };

/**
 * Emit a strict JSON-Schema for the given Zod schema. Every object is
 * marked `additionalProperties: false` so Claude Code has a hard contract
 * to validate against before writing a group file.
 */
export function toJsonSchema(schema: ZodType): JsonSchemaNode {
  const raw = z.toJSONSchema(schema) as JsonSchemaNode;
  delete raw.$schema;
  const strict = enforceStrictObjects(raw);
  return strict;
}

function enforceStrictObjects(node: unknown): JsonSchemaNode {
  if (!isJsonObject(node)) return node as JsonSchemaNode;
  const out: JsonSchemaNode = { ...node };
  if (out.type === 'object') {
    out.additionalProperties = false;
    const props = out.properties as Record<string, unknown> | undefined;
    if (props) {
      for (const k of Object.keys(props)) {
        props[k] = enforceStrictObjects(props[k]);
      }
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
