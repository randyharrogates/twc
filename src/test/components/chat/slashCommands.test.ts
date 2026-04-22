import { describe, expect, it, vi } from 'vitest';
import { dispatchSlashCommand, type SlashResult } from '../../../components/chat/slashCommands';
import type { ModelId } from '../../../lib/llm/types';

function deps(overrides: Partial<Parameters<typeof dispatchSlashCommand>[1]> = {}) {
  return {
    currentModelId: 'gpt-5-mini' as ModelId,
    planMode: false,
    apiKeys: { anthropic: 'sk-ant-x', openai: 'sk-x' },
    localConfigured: false,
    setModelOverride: vi.fn(),
    setLLMProvider: vi.fn(),
    setPlanMode: vi.fn(),
    ...overrides,
  };
}

function handled(r: SlashResult): Extract<SlashResult, { handled: true }> {
  if (!r.handled) throw new Error('expected handled=true, got handled=false');
  return r;
}

describe('dispatchSlashCommand', () => {
  it('returns handled=false for input that does not start with /', () => {
    const res = dispatchSlashCommand('hello world', deps());
    expect(res.handled).toBe(false);
  });

  it('/plan toggles the current plan mode flag', () => {
    const d = deps({ planMode: false });
    const res = handled(dispatchSlashCommand('/plan', d));
    expect(d.setPlanMode).toHaveBeenCalledWith(true);
    expect(res.kind).toBe('success');
    expect(res.message).toMatch(/Plan mode on/i);
  });

  it('/plan toggle also toggles the current plan mode flag', () => {
    const d = deps({ planMode: true });
    const res = handled(dispatchSlashCommand('/plan toggle', d));
    expect(d.setPlanMode).toHaveBeenCalledWith(false);
    expect(res.message).toMatch(/Plan mode off/i);
  });

  it('/plan on sets plan mode to true regardless of prior state', () => {
    const d = deps({ planMode: true });
    dispatchSlashCommand('/plan on', d);
    expect(d.setPlanMode).toHaveBeenCalledWith(true);
  });

  it('/plan off sets plan mode to false regardless of prior state', () => {
    const d = deps({ planMode: false });
    dispatchSlashCommand('/plan off', d);
    expect(d.setPlanMode).toHaveBeenCalledWith(false);
  });

  it('/plan nonsense returns an error without touching setPlanMode', () => {
    const d = deps();
    const res = handled(dispatchSlashCommand('/plan blargh', d));
    expect(res.kind).toBe('error');
    expect(d.setPlanMode).not.toHaveBeenCalled();
  });

  it('/model with no id echoes the current model', () => {
    const d = deps({ currentModelId: 'claude-haiku-4-5' });
    const res = handled(dispatchSlashCommand('/model', d));
    expect(res.kind).toBe('success');
    expect(res.message).toContain('claude-haiku-4-5');
    expect(d.setModelOverride).not.toHaveBeenCalled();
  });

  it('/model <valid id> switches model and provider', () => {
    const d = deps();
    const res = handled(dispatchSlashCommand('/model claude-sonnet-4-6', d));
    expect(res.kind).toBe('success');
    expect(d.setModelOverride).toHaveBeenCalledWith('claude-sonnet-4-6');
    expect(d.setLLMProvider).toHaveBeenCalledWith('anthropic');
    expect(res.message).toContain('Claude Sonnet 4.6');
  });

  it('/model <valid OpenAI id> routes to openai provider', () => {
    const d = deps();
    dispatchSlashCommand('/model gpt-4.1', d);
    expect(d.setModelOverride).toHaveBeenCalledWith('gpt-4.1');
    expect(d.setLLMProvider).toHaveBeenCalledWith('openai');
  });

  it('/model <valid id> with missing API key still switches but warns the user', () => {
    const d = deps({ apiKeys: { openai: 'sk-x' } });
    const res = handled(dispatchSlashCommand('/model claude-sonnet-4-6', d));
    expect(res.kind).toBe('success');
    expect(d.setModelOverride).toHaveBeenCalledWith('claude-sonnet-4-6');
    expect(d.setLLMProvider).toHaveBeenCalledWith('anthropic');
    expect(res.message).toMatch(/add an API key/i);
  });

  it('/model <unknown id> returns an error and does not switch', () => {
    const d = deps();
    const res = handled(dispatchSlashCommand('/model gpt-99-turbo', d));
    expect(res.kind).toBe('error');
    expect(d.setModelOverride).not.toHaveBeenCalled();
    expect(d.setLLMProvider).not.toHaveBeenCalled();
  });

  it('unknown /foo returns an error', () => {
    const d = deps();
    const res = handled(dispatchSlashCommand('/foo bar', d));
    expect(res.kind).toBe('error');
    expect(res.message).toMatch(/unknown command/i);
  });

  it('trims surrounding whitespace before parsing', () => {
    const d = deps();
    dispatchSlashCommand('  /plan on  ', d);
    expect(d.setPlanMode).toHaveBeenCalledWith(true);
  });
});
