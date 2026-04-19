import { describe, expect, it, vi } from 'vitest';
import { addMemberTool, executeAddMember } from '../../../lib/llm/tools/add_member';
import type { Group } from '../../../types';

function mkGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Trip',
    baseCurrency: 'USD',
    createdAt: 0,
    members: [{ id: 'a', name: 'Alice' }],
    expenses: [],
    rateHints: {},
    ...overrides,
  };
}

describe('addMemberTool spec', () => {
  it('is marked mutating and named add_member', () => {
    const spec = addMemberTool();
    expect(spec.name).toBe('add_member');
    expect(spec.mutating).toBe(true);
    expect(spec.description.length).toBeGreaterThan(10);
  });

  it('has a strict JSON schema requiring a name string', () => {
    const spec = addMemberTool();
    const props = spec.inputSchema.properties as Record<string, unknown>;
    expect(props.name).toBeDefined();
    expect(spec.inputSchema.additionalProperties).toBe(false);
  });
});

describe('executeAddMember', () => {
  it('calls addMember on the active group and returns the new id/name as JSON', async () => {
    const group = mkGroup();
    const addMember = vi.fn().mockReturnValue('m2');
    const res = await executeAddMember(group, { name: 'Marcus' }, { addMember });
    expect(addMember).toHaveBeenCalledWith('g1', 'Marcus');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { id: string; name: string };
      expect(parsed).toEqual({ id: 'm2', name: 'Marcus' });
    }
  });

  it('returns ok:false when the name is missing or empty', async () => {
    const group = mkGroup();
    const addMember = vi.fn();
    const res = await executeAddMember(group, { name: '' }, { addMember });
    expect(res.ok).toBe(false);
    expect(addMember).not.toHaveBeenCalled();
  });

  it('returns ok:false when the input has no name field', async () => {
    const group = mkGroup();
    const res = await executeAddMember(group, {}, { addMember: vi.fn() });
    expect(res.ok).toBe(false);
  });

  it('trims whitespace around the name', async () => {
    const group = mkGroup();
    const addMember = vi.fn().mockReturnValue('m2');
    await executeAddMember(group, { name: '  Marcus  ' }, { addMember });
    expect(addMember).toHaveBeenCalledWith('g1', 'Marcus');
  });
});
