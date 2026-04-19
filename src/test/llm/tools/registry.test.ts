import { describe, expect, it, vi } from 'vitest';
import { createAgentExecutor, primaryToolSpecs } from '../../../lib/llm/tools/registry';
import type { Group } from '../../../types';

function mkGroup(): Group {
  return {
    id: 'g1',
    name: 'Trip',
    baseCurrency: 'SGD',
    createdAt: 0,
    members: [
      { id: 'm-randy', name: 'Randy' },
      { id: 'm-marcus', name: 'Marcus' },
    ],
    expenses: [],
    rateHints: {},
  };
}

describe('primaryToolSpecs (chat mode)', () => {
  it('includes resolve_name, resolve_payer, lookup_fx_rate, add_member, and submit_drafts', () => {
    const names = primaryToolSpecs(mkGroup()).map((t) => t.name);
    expect(names).toContain('resolve_name');
    expect(names).toContain('resolve_payer');
    expect(names).toContain('lookup_fx_rate');
    expect(names).toContain('add_member');
    expect(names).toContain('submit_drafts');
  });

  it('defaults to chat mode when planMode is omitted', () => {
    const names = primaryToolSpecs(mkGroup()).map((t) => t.name);
    expect(names).toContain('submit_drafts');
    expect(names).toContain('add_member');
  });

  it('places resolve_payer between resolve_name and add_member', () => {
    const names = primaryToolSpecs(mkGroup()).map((t) => t.name);
    const iResolveName = names.indexOf('resolve_name');
    const iResolvePayer = names.indexOf('resolve_payer');
    const iAddMember = names.indexOf('add_member');
    expect(iResolveName).toBeLessThan(iResolvePayer);
    expect(iResolvePayer).toBeLessThan(iAddMember);
  });
});

describe('primaryToolSpecs (plan mode)', () => {
  it('omits add_member and submit_drafts when planMode=true', () => {
    const names = primaryToolSpecs(mkGroup(), true).map((t) => t.name);
    expect(names).not.toContain('add_member');
    expect(names).not.toContain('submit_drafts');
  });

  it('still exposes resolve_name, resolve_payer, and lookup_fx_rate in plan mode', () => {
    const names = primaryToolSpecs(mkGroup(), true).map((t) => t.name);
    expect(names).toContain('resolve_name');
    expect(names).toContain('resolve_payer');
    expect(names).toContain('lookup_fx_rate');
  });
});

describe('createAgentExecutor resolve_payer dispatch', () => {
  it('routes resolve_payer calls to the payerPrompter', async () => {
    const group = mkGroup();
    const requestPayer = vi.fn().mockResolvedValue({ payerId: 'm-marcus' });
    const executor = createAgentExecutor(group, {
      addMember: vi.fn().mockReturnValue('new-id'),
      ratePrompter: { requestRate: vi.fn().mockResolvedValue({ rate: null }) },
      setRateHint: vi.fn(),
      payerPrompter: { requestPayer },
    });
    const res = await executor.execute('resolve_payer', {
      description: 'Taxi',
      amountMinor: 2000,
      currency: 'SGD',
    });
    expect(requestPayer).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { payerId: string | null };
      expect(parsed.payerId).toBe('m-marcus');
    }
  });
});
