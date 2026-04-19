import { describe, expect, it, vi } from 'vitest';
import {
  runTurn,
  type AgentClient,
  type AgentMessage,
  type AgentTurnRequest,
  type AssistantTurnResult,
  type PermissionPrompter,
  type ToolExecutor,
} from '../../lib/llm/agent';
import type { ToolSpec } from '../../lib/llm/tools/registry';

type TurnCall = [AgentTurnRequest, { onPartialText?: (t: string) => void; signal?: AbortSignal } | undefined];

function callOf(sendTurn: { mock: { calls: unknown[][] } }, i: number): TurnCall {
  return sendTurn.mock.calls[i] as TurnCall;
}

const READ_TOOL: ToolSpec = {
  name: 'resolve_name',
  description: 'read-only fuzzy lookup',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  mutating: false,
};

const MUTATING_TOOL: ToolSpec = {
  name: 'add_member',
  description: 'adds a member to the group',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  mutating: true,
};

const SUBMIT_TOOL: ToolSpec = {
  name: 'submit_drafts',
  description: 'terminal submit',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  mutating: false,
};

function mockClient(responses: AssistantTurnResult[]) {
  const sendTurn = vi.fn(async (): Promise<AssistantTurnResult> => {
    if (responses.length === 0) throw new Error('no more mocked responses');
    return responses.shift()!;
  });
  const client: AgentClient = { sendTurn };
  return { client, sendTurn };
}

function text(text: string, usage = { inputTokens: 1, outputTokens: 1 }): AssistantTurnResult {
  return { blocks: [{ type: 'text', text }], usage, stopReason: 'end_turn' };
}

function toolUse(
  id: string,
  name: string,
  input: unknown,
  usage = { inputTokens: 1, outputTokens: 1 },
): AssistantTurnResult {
  return {
    blocks: [{ type: 'tool_use', id, name, input }],
    usage,
    stopReason: 'tool_use',
  };
}

function userText(t: string) {
  return [{ type: 'text' as const, text: t }];
}

describe('runTurn — no-tool path', () => {
  it('returns finalText verbatim when the assistant never calls a tool', async () => {
    const { client, sendTurn } = mockClient([text('hello there')]);
    const executor: ToolExecutor = { execute: vi.fn() };
    const prompter: PermissionPrompter = { decide: vi.fn() };
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('hi'),
      tools: [READ_TOOL],
      executor,
      prompter,
      model: 'claude-haiku-4-5',
    });
    expect(res.finalText).toBe('hello there');
    expect(executor.execute).not.toHaveBeenCalled();
    expect(sendTurn).toHaveBeenCalledTimes(1);
  });
});

describe('runTurn — tool dispatch', () => {
  it('dispatches a read-only tool without prompting and feeds the result back', async () => {
    const { client, sendTurn } = mockClient([
      toolUse('tu1', 'resolve_name', { query: 'Marcus' }, { inputTokens: 10, outputTokens: 5 }),
      text('no match — advise', { inputTokens: 20, outputTokens: 8 }),
    ]);
    const execute = vi.fn().mockResolvedValue({ ok: true, content: '{"matches":[]}' });
    const decide = vi.fn();
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('who is Marcus?'),
      tools: [READ_TOOL],
      executor: { execute },
      prompter: { decide },
      model: 'claude-haiku-4-5',
    });
    expect(execute).toHaveBeenCalledWith('resolve_name', { query: 'Marcus' });
    expect(decide).not.toHaveBeenCalled();
    expect(res.finalText).toBe('no match — advise');
    expect(res.usage).toEqual({ inputTokens: 30, outputTokens: 13 });
    expect(res.toolTrace).toHaveLength(1);
    expect(res.toolTrace[0]).toMatchObject({ name: 'resolve_name', isError: false });
    // second call's last message is the tool_result
    const secondCall = callOf(sendTurn, 1)[0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.blocks[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'tu1',
      isError: false,
    });
  });

  it('prompts for permission on a mutating tool and executes when allowed', async () => {
    const { client } = mockClient([
      toolUse('tu1', 'add_member', { name: 'Marcus' }),
      text('added.'),
    ]);
    const execute = vi.fn().mockResolvedValue({ ok: true, content: '{"id":"m1"}' });
    const decide = vi.fn().mockResolvedValue('allow');
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('add Marcus'),
      tools: [MUTATING_TOOL],
      executor: { execute },
      prompter: { decide },
      model: 'claude-haiku-4-5',
    });
    expect(decide).toHaveBeenCalledWith({
      tool: 'add_member',
      input: { name: 'Marcus' },
      mutating: true,
    });
    expect(execute).toHaveBeenCalled();
    expect(res.finalText).toBe('added.');
  });

  it('deny returns a tool_result with isError:true and never calls the executor', async () => {
    const { client, sendTurn } = mockClient([
      toolUse('tu1', 'add_member', { name: 'Marcus' }),
      text('user declined'),
    ]);
    const execute = vi.fn();
    const decide = vi.fn().mockResolvedValue('deny');
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('add Marcus'),
      tools: [MUTATING_TOOL],
      executor: { execute },
      prompter: { decide },
      model: 'claude-haiku-4-5',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(res.finalText).toBe('user declined');
    const secondCall = callOf(sendTurn, 1)[0];
    const lastBlock = secondCall.messages[secondCall.messages.length - 1].blocks[0];
    expect(lastBlock).toMatchObject({ type: 'tool_result', toolUseId: 'tu1', isError: true });
    expect(res.toolTrace[0].isError).toBe(true);
  });

  it('surfaces executor errors as isError tool_results (not thrown)', async () => {
    const { client } = mockClient([
      toolUse('tu1', 'resolve_name', { query: 'x' }),
      text('recovered'),
    ]);
    const execute = vi.fn().mockResolvedValue({ ok: false, error: 'bad input shape' });
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    expect(res.toolTrace[0].isError).toBe(true);
    expect(res.finalText).toBe('recovered');
  });

  it('dispatches multiple tool_use blocks from one round as one combined user message', async () => {
    const assistantRound: AssistantTurnResult = {
      blocks: [
        { type: 'tool_use', id: 'tu1', name: 'resolve_name', input: { query: 'a' } },
        { type: 'tool_use', id: 'tu2', name: 'resolve_name', input: { query: 'b' } },
      ],
      usage: { inputTokens: 10, outputTokens: 10 },
      stopReason: 'tool_use',
    };
    const { client, sendTurn } = mockClient([assistantRound, text('done')]);
    const execute = vi.fn().mockResolvedValue({ ok: true, content: '[]' });
    await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    expect(execute).toHaveBeenCalledTimes(2);
    const secondCall = callOf(sendTurn, 1)[0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.blocks).toHaveLength(2);
    expect(lastMsg.blocks[0]).toMatchObject({ type: 'tool_result', toolUseId: 'tu1' });
    expect(lastMsg.blocks[1]).toMatchObject({ type: 'tool_result', toolUseId: 'tu2' });
  });
});

describe('runTurn — default iteration cap', () => {
  it('runs 32 iterations before flagging truncatedLoop (claw-code sub-agent parity)', async () => {
    const looping = (): AssistantTurnResult => toolUse('tu-loop', 'resolve_name', {});
    const { client } = mockClient(Array.from({ length: 32 }, () => looping()));
    const execute = vi.fn().mockResolvedValue({ ok: true, content: '' });
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    expect(res.truncatedLoop).toBe(true);
    expect(execute).toHaveBeenCalledTimes(32);
  });
});

describe('runTurn — truncation and loop bounds', () => {
  it('returns truncatedLoop=true when iterations exceeds maxIterations', async () => {
    const looping = (): AssistantTurnResult => toolUse('tu-loop', 'resolve_name', {});
    const { client } = mockClient([looping(), looping(), looping(), looping()]);
    const execute = vi.fn().mockResolvedValue({ ok: true, content: '' });
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
      maxIterations: 2,
    });
    expect(res.truncatedLoop).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('surfaces truncatedOutput when stopReason is max_tokens and halts the loop', async () => {
    const { client, sendTurn } = mockClient([
      {
        blocks: [{ type: 'text', text: 'partial…' }],
        usage: { inputTokens: 10, outputTokens: 4096 },
        stopReason: 'max_tokens',
      },
    ]);
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [SUBMIT_TOOL],
      executor: { execute: vi.fn() },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    expect(res.truncatedOutput).toBe(true);
    expect(sendTurn).toHaveBeenCalledTimes(1);
  });
});

describe('runTurn — lookup_fx_rate source:null flow', () => {
  it('ends the turn with plain text when lookup_fx_rate returns source:null', async () => {
    const FX_TOOL: ToolSpec = {
      name: 'lookup_fx_rate',
      description: 'fx',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      mutating: false,
    };
    const { client } = mockClient([
      toolUse('tu1', 'lookup_fx_rate', { from: 'MYR', to: 'SGD' }),
      text('I need the MYR→SGD rate before I can produce drafts. Please provide it.'),
    ]);
    const execute = vi
      .fn()
      .mockResolvedValue({ ok: true, content: JSON.stringify({ rate: null, source: null }) });
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('parse this MYR receipt'),
      tools: [FX_TOOL, SUBMIT_TOOL],
      executor: { execute },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(res.finalText).toMatch(/rate/i);
    expect(res.toolTrace).toHaveLength(1);
    expect(res.toolTrace[0].name).toBe('lookup_fx_rate');
    // assistant ended without calling submit_drafts
    const submitCalls = res.toolTrace.filter((t) => t.name === 'submit_drafts');
    expect(submitCalls).toHaveLength(0);
  });
});

describe('runTurn — reasoningEffort + onPhase', () => {
  it('forwards reasoningEffort from RunTurnOpts into every sendTurn request', async () => {
    const { client, sendTurn } = mockClient([
      toolUse('tu1', 'resolve_name', {}),
      text('done'),
    ]);
    await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute: vi.fn().mockResolvedValue({ ok: true, content: 'y' }) },
      prompter: { decide: vi.fn() },
      model: 'gpt-5-mini',
      reasoningEffort: 'medium',
    });
    for (let i = 0; i < sendTurn.mock.calls.length; i++) {
      const req = callOf(sendTurn, i)[0];
      expect(req.reasoningEffort).toBe('medium');
    }
  });

  it('fires onPhase events at each boundary in order', async () => {
    const { client } = mockClient([
      toolUse('tu1', 'resolve_name', { q: 'a' }),
      text('done'),
    ]);
    const phases: string[] = [];
    await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute: vi.fn().mockResolvedValue({ ok: true, content: 'y' }) },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
      onPhase: (p) => {
        if (p.kind === 'calling_tool' || p.kind === 'tool_done') {
          phases.push(`${p.kind}:${p.name}`);
        } else {
          phases.push(p.kind);
        }
      },
    });
    expect(phases[0]).toBe('starting');
    expect(phases).toContain('thinking');
    expect(phases).toContain('calling_tool:resolve_name');
    expect(phases).toContain('tool_done:resolve_name');
    const toolStartIdx = phases.indexOf('calling_tool:resolve_name');
    const toolEndIdx = phases.indexOf('tool_done:resolve_name');
    expect(toolStartIdx).toBeLessThan(toolEndIdx);
  });
});

describe('runTurn — pass-through hooks', () => {
  it('forwards onPartialText and signal into every sendTurn call', async () => {
    const controller = new AbortController();
    const sendTurn = vi.fn().mockImplementation(async (_req: unknown, opts?: { onPartialText?: (t: string) => void; signal?: AbortSignal }) => {
      opts?.onPartialText?.('hi');
      expect(opts?.signal).toBe(controller.signal);
      return text('hi');
    });
    const client: AgentClient = { sendTurn };
    const partials: string[] = [];
    const res = await runTurn({
      client,
      system: 'sys',
      history: [],
      userBlocks: userText('x'),
      tools: [],
      executor: { execute: vi.fn() },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
      onPartialText: (t) => partials.push(t),
      signal: controller.signal,
    });
    expect(partials).toContain('hi');
    expect(res.finalText).toBe('hi');
  });

  it('preserves history in the first request and appends assistant+tool_result messages in order', async () => {
    const pastAssistant: AgentMessage = {
      role: 'assistant',
      blocks: [{ type: 'text', text: 'earlier' }],
    };
    const { client, sendTurn } = mockClient([
      toolUse('tu1', 'resolve_name', { query: 'x' }),
      text('done'),
    ]);
    await runTurn({
      client,
      system: 'sys',
      history: [pastAssistant],
      userBlocks: userText('x'),
      tools: [READ_TOOL],
      executor: { execute: vi.fn().mockResolvedValue({ ok: true, content: 'y' }) },
      prompter: { decide: vi.fn() },
      model: 'claude-haiku-4-5',
    });
    const firstReq = callOf(sendTurn, 0)[0];
    expect(firstReq.messages[0]).toBe(pastAssistant);
    expect(firstReq.messages[1].role).toBe('user');
    expect(firstReq.messages[1].blocks[0]).toMatchObject({ type: 'text', text: 'x' });
    const secondReq = callOf(sendTurn, 1)[0];
    // first user msg, assistant tool_use, then user tool_result
    expect(secondReq.messages.map((m: AgentMessage) => m.role)).toEqual([
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
  });
});
