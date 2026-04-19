import { z } from 'zod/v3';
import type { Group } from '../../../types';
import { toJsonSchema } from '../schema';
import { toolErr, toolOk, type ToolExecutionResult, type ToolSpec } from './registry';

const AddMemberInputSchema = z
  .object({
    name: z.string().min(1).max(50),
  })
  .strict();

export interface AddMemberDeps {
  addMember: (groupId: string, name: string) => string;
}

export function addMemberTool(): ToolSpec {
  return {
    name: 'add_member',
    description:
      'Add a new member to the active group. Use when a receipt references a name that is not in the member list.',
    inputSchema: toJsonSchema(AddMemberInputSchema) as Record<string, unknown>,
    mutating: true,
  };
}

export async function executeAddMember(
  group: Group,
  input: unknown,
  deps: AddMemberDeps,
): Promise<ToolExecutionResult> {
  const parsed = AddMemberInputSchema.safeParse(normalize(input));
  if (!parsed.success) return toolErr(formatIssues(parsed.error.issues));
  const name = parsed.data.name.trim();
  if (name.length === 0) return toolErr('Member name cannot be empty or whitespace.');
  try {
    const id = deps.addMember(group.id, name);
    return toolOk(JSON.stringify({ id, name }));
  } catch (err) {
    return toolErr(err instanceof Error ? err.message : 'addMember failed.');
  }
}

function normalize(input: unknown): unknown {
  if (input && typeof input === 'object' && 'name' in input) {
    const obj = input as { name?: unknown };
    if (typeof obj.name === 'string') return { ...obj, name: obj.name.trim() };
  }
  return input;
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}
