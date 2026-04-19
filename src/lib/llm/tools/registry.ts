import type { CurrencyCode, Group } from '../../../types';
import type { PayerPrompter, RatePrompter, ToolExecution, ToolExecutor } from '../agent';
import { addMemberTool, executeAddMember } from './add_member';
import { lookupFxRateTool, executeLookupFxRate } from './lookup_fx_rate';
import { resolveNameTool, executeResolveName } from './resolve_name';
import { executeResolvePayer, resolvePayerTool } from './resolve_payer';
import { executeSubmitDrafts, submitDraftsTool, SUBMIT_DRAFTS_TOOL_NAME } from './submit_drafts';

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
}

export interface ToolExecutionResult {
  ok: boolean;
  content: string;
  error?: string;
}

export function toolOk(content: string): ToolExecutionResult {
  return { ok: true, content };
}

export function toolErr(error: string): ToolExecutionResult {
  return { ok: false, content: error, error };
}

export interface AgentToolDeps {
  addMember: (groupId: string, name: string) => string;
  ratePrompter: RatePrompter;
  payerPrompter: PayerPrompter;
  setRateHint: (groupId: string, code: CurrencyCode, rate: number) => void;
}

export function primaryToolSpecs(group: Group, planMode = false): ToolSpec[] {
  const memberIds = group.members.map((m) => m.id);
  const specs: ToolSpec[] = [
    resolveNameTool(),
    resolvePayerTool(),
    lookupFxRateTool(),
  ];
  if (!planMode) {
    specs.push(addMemberTool(), submitDraftsTool(memberIds));
  }
  return specs;
}

export function createAgentExecutor(group: Group, deps: AgentToolDeps): ToolExecutor {
  return {
    async execute(name, input): Promise<ToolExecution> {
      const res = await dispatch(name, group, input, deps);
      if (res.ok) return { ok: true, content: res.content };
      return { ok: false, error: res.error ?? res.content };
    },
  };
}

async function dispatch(
  name: string,
  group: Group,
  input: unknown,
  deps: AgentToolDeps,
): Promise<ToolExecutionResult> {
  switch (name) {
    case 'add_member':
      return executeAddMember(group, input, deps);
    case 'resolve_name':
      return executeResolveName(group, input);
    case 'resolve_payer':
      return executeResolvePayer(group, input, { payerPrompter: deps.payerPrompter });
    case 'lookup_fx_rate':
      return executeLookupFxRate(group, input, {
        ratePrompter: deps.ratePrompter,
        setRateHint: deps.setRateHint,
      });
    case SUBMIT_DRAFTS_TOOL_NAME:
      return executeSubmitDrafts(group, input);
    default:
      return toolErr(`Unknown tool: ${name}`);
  }
}

export { SUBMIT_DRAFTS_TOOL_NAME };
