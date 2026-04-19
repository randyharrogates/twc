import type { Group } from '../../../types';
import { CURRENCY_CODES } from '../../currency';
import { AssistantResponseSchema, toJsonSchema } from '../schema';
import type { ExpenseDraft } from '../types';
import { toolErr, toolOk, type ToolExecutionResult, type ToolSpec } from './registry';

export const SUBMIT_DRAFTS_TOOL_NAME = 'submit_drafts';

export function submitDraftsTool(memberIds: string[]): ToolSpec {
  return {
    name: SUBMIT_DRAFTS_TOOL_NAME,
    description:
      'Emit the final assistantText and zero or more parsed expense drafts. Call this exactly once, at the very end of the turn, when no further tools are needed.',
    inputSchema: toJsonSchema(AssistantResponseSchema(memberIds, [...CURRENCY_CODES])) as Record<string, unknown>,
    mutating: false,
  };
}

export interface SubmitDraftsOutput {
  assistantText: string;
  drafts: ExpenseDraft[];
}

export async function executeSubmitDrafts(
  group: Group,
  input: unknown,
): Promise<ToolExecutionResult> {
  const memberIds = group.members.map((m) => m.id);
  const schema = AssistantResponseSchema(memberIds, [...CURRENCY_CODES]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return toolErr(msg);
  }
  return toolOk(
    JSON.stringify({
      assistantText: parsed.data.assistantText,
      drafts: parsed.data.drafts,
    }),
  );
}

export function parseSubmitDraftsContent(content: string): SubmitDraftsOutput | null {
  try {
    const parsed = JSON.parse(content) as SubmitDraftsOutput;
    if (typeof parsed.assistantText !== 'string' || !Array.isArray(parsed.drafts)) return null;
    return parsed;
  } catch {
    return null;
  }
}
