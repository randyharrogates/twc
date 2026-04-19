import { z } from 'zod/v3';
import type { Group } from '../../../types';
import { fuzzyMatchNames } from '../../fuzzy';
import { toJsonSchema } from '../schema';
import { toolErr, toolOk, type ToolExecutionResult, type ToolSpec } from './registry';

const ResolveNameInputSchema = z
  .object({
    query: z.string().min(1).max(80),
  })
  .strict();

const MIN_CONFIDENCE = 0.35;
const MAX_MATCHES = 5;

export function resolveNameTool(): ToolSpec {
  return {
    name: 'resolve_name',
    description:
      'Fuzzy-match a human-typed name against the active group members. Returns zero or more candidate {id, name, confidence} sorted by confidence desc.',
    inputSchema: toJsonSchema(ResolveNameInputSchema) as Record<string, unknown>,
    mutating: false,
  };
}

export async function executeResolveName(
  group: Group,
  input: unknown,
): Promise<ToolExecutionResult> {
  const parsed = ResolveNameInputSchema.safeParse(input);
  if (!parsed.success) return toolErr(parsed.error.issues.map((i) => i.message).join('; '));
  const matches = fuzzyMatchNames(parsed.data.query, group.members, MIN_CONFIDENCE).slice(
    0,
    MAX_MATCHES,
  );
  return toolOk(JSON.stringify({ matches }));
}
