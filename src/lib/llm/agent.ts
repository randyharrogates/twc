import type { CurrencyCode, Member } from '../../types';
import type {
  AgentPhase,
  ContentBlock,
  ModelId,
  ReasoningEffort,
  SendOptions,
  TokenUsage,
} from './types';
import type { ToolSpec } from './tools/registry';

export type AssistantResponseBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens';

export interface AssistantTurnResult {
  blocks: AssistantResponseBlock[];
  usage: TokenUsage;
  stopReason: StopReason;
  requestId?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  blocks: ContentBlock[];
}

export interface AgentTurnRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  model: ModelId;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface AgentClient {
  sendTurn(req: AgentTurnRequest, opts?: SendOptions): Promise<AssistantTurnResult>;
}

export type ToolExecution =
  | { ok: true; content: string }
  | { ok: false; error: string };

export interface ToolExecutor {
  execute(name: string, input: unknown): Promise<ToolExecution>;
}

export type PermissionDecision = 'allow' | 'deny';

export interface PermissionPrompter {
  decide(req: { tool: string; input: unknown; mutating: boolean }): Promise<PermissionDecision>;
}

export interface RatePromptRequest {
  from: CurrencyCode;
  to: CurrencyCode;
  suggested?: number;
}

export interface RatePrompter {
  requestRate(req: RatePromptRequest): Promise<{ rate: number | null }>;
}

export interface PayerPromptRequest {
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  members: Member[];
}

export interface PayerPrompter {
  requestPayer(req: PayerPromptRequest): Promise<{ payerId: string | null }>;
}

export interface RunTurnOpts {
  client: AgentClient;
  system: string;
  history: AgentMessage[];
  userBlocks: ContentBlock[];
  tools: ToolSpec[];
  executor: ToolExecutor;
  prompter: PermissionPrompter;
  model: ModelId;
  onPartialText?: (t: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  signal?: AbortSignal;
  maxIterations?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface AgentTurnResult {
  finalText: string;
  messages: AgentMessage[];
  usage: TokenUsage;
  stopReason: StopReason;
  truncatedLoop?: boolean;
  truncatedOutput?: boolean;
  toolTrace: Array<{
    id: string;
    name: string;
    input: unknown;
    output: string;
    isError: boolean;
  }>;
}

// 32 matches claw-code's sub-agent cap (DEFAULT_AGENT_MAX_ITERATIONS) —
// cf. claw-code/rust/crates/tools/src/lib.rs:3475. Receipt parsing with many
// members + FX lookups can legitimately require 20-30 tool rounds.
const DEFAULT_MAX_ITERATIONS = 32;

export async function runTurn(opts: RunTurnOpts): Promise<AgentTurnResult> {
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const toolByName = new Map(opts.tools.map((t) => [t.name, t]));

  const messages: AgentMessage[] = [
    ...opts.history,
    { role: 'user', blocks: opts.userBlocks },
  ];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const toolTrace: AgentTurnResult['toolTrace'] = [];
  let lastStopReason: StopReason = 'end_turn';
  let truncatedOutput = false;
  let truncatedLoop = false;

  opts.onPhase?.({ kind: 'starting' });

  for (let iter = 0; iter < maxIterations; iter++) {
    opts.onPhase?.({ kind: 'thinking' });
    const turn = await opts.client.sendTurn(
      {
        system: opts.system,
        messages: messages.slice(),
        tools: opts.tools,
        model: opts.model,
        reasoningEffort: opts.reasoningEffort,
      },
      {
        signal: opts.signal,
        onPartialText: opts.onPartialText,
        onPhase: opts.onPhase,
      },
    );
    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;
    lastStopReason = turn.stopReason;

    messages.push({ role: 'assistant', blocks: assistantToContentBlocks(turn.blocks) });

    if (turn.stopReason === 'max_tokens') {
      truncatedOutput = true;
      break;
    }

    const toolUses = turn.blocks.filter(
      (b): b is Extract<AssistantResponseBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    );
    if (toolUses.length === 0) break;

    const resultBlocks: ContentBlock[] = [];
    for (const tu of toolUses) {
      const spec = toolByName.get(tu.name);
      const mutating = spec?.mutating ?? false;
      opts.onPhase?.({ kind: 'calling_tool', name: tu.name });

      let resolved: { output: string; isError: boolean };
      if (!spec) {
        resolved = { output: `Unknown tool: ${tu.name}`, isError: true };
      } else if (mutating) {
        const decision = await opts.prompter.decide({
          tool: tu.name,
          input: tu.input,
          mutating: true,
        });
        if (decision === 'deny') {
          resolved = {
            output: `User denied the ${tu.name} request. Explain your reasoning in assistantText or propose alternatives.`,
            isError: true,
          };
        } else {
          resolved = await runExecutor(opts.executor, tu.name, tu.input);
        }
      } else {
        resolved = await runExecutor(opts.executor, tu.name, tu.input);
      }

      opts.onPhase?.({ kind: 'tool_done', name: tu.name, ok: !resolved.isError });
      toolTrace.push({
        id: tu.id,
        name: tu.name,
        input: tu.input,
        output: resolved.output,
        isError: resolved.isError,
      });
      resultBlocks.push({
        type: 'tool_result',
        toolUseId: tu.id,
        content: [{ type: 'text', text: resolved.output }],
        isError: resolved.isError,
      });
    }
    messages.push({ role: 'user', blocks: resultBlocks });

    if (iter === maxIterations - 1) {
      truncatedLoop = true;
    }
  }

  const finalText = collectFinalText(messages);
  const result: AgentTurnResult = {
    finalText,
    messages,
    usage,
    stopReason: lastStopReason,
    toolTrace,
  };
  if (truncatedLoop) result.truncatedLoop = true;
  if (truncatedOutput) result.truncatedOutput = true;
  return result;
}

async function runExecutor(
  executor: ToolExecutor,
  name: string,
  input: unknown,
): Promise<{ output: string; isError: boolean }> {
  try {
    const res = await executor.execute(name, input);
    if (res.ok) return { output: res.content, isError: false };
    return { output: res.error, isError: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: `Tool execution threw: ${message}`, isError: true };
  }
}

function assistantToContentBlocks(blocks: AssistantResponseBlock[]): ContentBlock[] {
  return blocks.map((b) =>
    b.type === 'text'
      ? ({ type: 'text', text: b.text } as ContentBlock)
      : ({ type: 'tool_use', id: b.id, name: b.name, input: b.input } as ContentBlock),
  );
}

function collectFinalText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const texts = m.blocks
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text);
    if (texts.length > 0) return texts.join('\n');
  }
  return '';
}
