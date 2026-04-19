import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt } from '../../lib/llm/prompt';
import type { ChatContext } from '../../lib/llm/types';
import type { ToolSpec } from '../../lib/llm/tools/registry';

function ctx(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    members: [
      { id: 'member-alice', name: 'Alice' },
      { id: 'member-bob', name: 'Bob' },
      { id: 'member-charlie', name: 'Charlie' },
    ],
    baseCurrency: 'JPY',
    rateHints: {},
    history: [],
    model: 'claude-haiku-4-5',
    ...overrides,
  };
}

describe('buildAgentSystemPrompt', () => {
  const tools: ToolSpec[] = [
    { name: 'resolve_name', description: 'fuzzy name match', inputSchema: {}, mutating: false },
    { name: 'add_member', description: 'add a member', inputSchema: {}, mutating: true },
    { name: 'submit_drafts', description: 'emit final drafts', inputSchema: {}, mutating: false },
  ];

  it('anchors the assistant to the active group by name', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Bali Trip', tools);
    expect(prompt).toContain('"Bali Trip"');
    expect(prompt).toMatch(/cannot reference or mutate any\s+other group/);
  });

  it('lists every tool name, marking mutating tools explicitly', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).toContain('resolve_name');
    expect(prompt).toContain('add_member');
    expect(prompt).toContain('submit_drafts');
    expect(prompt).toMatch(/add_member.*mutating/);
    expect(prompt).not.toMatch(/resolve_name.*mutating/);
  });

  it('preserves the money invariant and split-mode rules', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).toContain('Σ shares === amountMinor');
    expect(prompt).toMatch(/\beven\b/);
    expect(prompt).toMatch(/\bshares\b/);
  });

  it('instructs the assistant to end the turn by calling submit_drafts', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).toMatch(/submit_drafts/);
    expect(prompt).toMatch(/End the turn/i);
  });

  it('emits a member table with every id and warns about inventing ids', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).toContain('member-alice');
    expect(prompt).toContain('member-bob');
    expect(prompt).toContain('member-charlie');
    expect(prompt).toContain('verbatim');
    expect(prompt).toContain('never invent ids');
  });

  it('includes the PAYER RULES block with resolve_payer guidance', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).toContain('PAYER RULES');
    expect(prompt).toContain('resolve_payer');
    expect(prompt).toMatch(/Do NOT guess/);
    expect(prompt).toMatch(/Do NOT pick a random member/i);
    expect(prompt).toMatch(/payerId:\s*null/);
  });

  it('PAYER RULES appears between CROSS-CURRENCY and the split-modes block', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    const iCross = prompt.indexOf('CROSS-CURRENCY');
    const iPayer = prompt.indexOf('PAYER RULES');
    const iSplit = prompt.indexOf('Split modes');
    expect(iCross).toBeGreaterThanOrEqual(0);
    expect(iPayer).toBeGreaterThan(iCross);
    expect(iSplit).toBeGreaterThan(iPayer);
  });

  it('does NOT append the PLAN MODE (active) block when planMode is false or omitted', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools);
    expect(prompt).not.toContain('PLAN MODE (active)');
    const promptExplicit = buildAgentSystemPrompt(ctx(), 'Trip', tools, false);
    expect(promptExplicit).not.toContain('PLAN MODE (active)');
  });

  it('appends a PLAN MODE (active) block that blocks submit_drafts + add_member when planMode=true', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools, true);
    expect(prompt).toContain('PLAN MODE (active)');
    expect(prompt).toMatch(/submit_drafts.*unavailable|unavailable.*submit_drafts/);
    expect(prompt).toContain('add_member');
    expect(prompt).toMatch(/Toggle off plan mode and re-send to execute/);
  });

  it('plan mode mandates resolve_payer for ambiguous payers before plain-text fallback', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools, true);
    expect(prompt).toContain('MANDATORY TOOL CALLS');
    expect(prompt).toContain('you MUST call `resolve_payer`');
    expect(prompt).toContain(
      'The only path to a plain-text fallback is `resolve_payer` returning `{payerId: null}`',
    );
  });

  it('plan mode mandates lookup_fx_rate for cross-currency receipts before plain-text fallback', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools, true);
    expect(prompt).toContain('you MUST call `lookup_fx_rate`');
    expect(prompt).toContain(
      'The only path to a plain-text fallback is `lookup_fx_rate` returning `source: null`',
    );
  });

  it('planMode=false prompt does not leak PLAN MODE language (regression guard)', () => {
    const prompt = buildAgentSystemPrompt(ctx(), 'Trip', tools, false);
    expect(prompt).not.toContain('PLAN MODE');
    expect(prompt).not.toContain('MANDATORY TOOL CALLS');
  });
});
