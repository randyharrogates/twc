import { describe, expect, it, vi } from 'vitest';
import type { CurrencyCode } from '../../../types';
import { executeLookupFxRate, lookupFxRateTool } from '../../../lib/llm/tools/lookup_fx_rate';
import type { RatePrompter } from '../../../lib/llm/agent';
import type { Group } from '../../../types';

function mkGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Trip',
    baseCurrency: 'SGD',
    createdAt: 0,
    members: [],
    expenses: [],
    rateHints: {},
    ...overrides,
  };
}

function mkPrompter(rate: number | null): RatePrompter & { requestRate: ReturnType<typeof vi.fn> } {
  const requestRate = vi.fn().mockResolvedValue({ rate });
  return { requestRate } as RatePrompter & { requestRate: ReturnType<typeof vi.fn> };
}

function setRateHintSpy(): (groupId: string, code: CurrencyCode, rate: number) => void {
  return vi.fn();
}

describe('lookupFxRateTool spec', () => {
  it('is read-only and named lookup_fx_rate', () => {
    const spec = lookupFxRateTool();
    expect(spec.name).toBe('lookup_fx_rate');
    expect(spec.mutating).toBe(false);
  });
});

describe('executeLookupFxRate', () => {
  it('prompts user first, returns user rate, persists via setRateHint (2-decimal currency)', async () => {
    const g = mkGroup({ baseCurrency: 'SGD' });
    const ratePrompter = mkPrompter(0.29);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'MYR', to: 'SGD' }, { ratePrompter, setRateHint });

    expect(ratePrompter.requestRate).toHaveBeenCalledWith({
      from: 'MYR',
      to: 'SGD',
      suggested: undefined,
    });
    expect(setRateHint).toHaveBeenCalledWith('g1', 'MYR', 0.29);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number; source: string };
      expect(parsed.rate).toBe(0.29);
      expect(parsed.source).toBe('user');
    }
  });

  it('pre-fills the prompt with the stored hint as `suggested`', async () => {
    const g = mkGroup({ baseCurrency: 'SGD', rateHints: { MYR: 0.3 } });
    const ratePrompter = mkPrompter(0.29);
    const setRateHint = setRateHintSpy();
    await executeLookupFxRate(g, { from: 'MYR', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(ratePrompter.requestRate).toHaveBeenCalledWith({
      from: 'MYR',
      to: 'SGD',
      suggested: 0.3,
    });
  });

  it('user skips → falls back to stored rateHints (source: rateHints)', async () => {
    const g = mkGroup({ baseCurrency: 'SGD', rateHints: { MYR: 0.3 } });
    const ratePrompter = mkPrompter(null);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'MYR', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(setRateHint).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number; source: string };
      expect(parsed.rate).toBe(0.3);
      expect(parsed.source).toBe('rateHints');
    }
  });

  it('user skips + no rateHints → returns {rate: null, source: null}', async () => {
    const g = mkGroup({ baseCurrency: 'SGD' });
    const ratePrompter = mkPrompter(null);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'MYR', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(setRateHint).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number | null; source: string | null };
      expect(parsed.rate).toBeNull();
      expect(parsed.source).toBeNull();
    }
  });

  it('handles a 0-decimal currency (JPY → SGD) just like a 2-decimal one', async () => {
    const g = mkGroup({ baseCurrency: 'SGD' });
    const ratePrompter = mkPrompter(0.0089);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'JPY', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(setRateHint).toHaveBeenCalledWith('g1', 'JPY', 0.0089);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number; source: string };
      expect(parsed.rate).toBe(0.0089);
      expect(parsed.source).toBe('user');
    }
  });

  it('returns ok:false when `to` differs from group baseCurrency (and does NOT prompt)', async () => {
    const g = mkGroup({ baseCurrency: 'SGD' });
    const ratePrompter = mkPrompter(0.29);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'MYR', to: 'EUR' }, { ratePrompter, setRateHint });
    expect(res.ok).toBe(false);
    expect(ratePrompter.requestRate).not.toHaveBeenCalled();
    expect(setRateHint).not.toHaveBeenCalled();
  });

  it('from === to short-circuits with rate:1 and source:identity (no prompt)', async () => {
    const g = mkGroup({ baseCurrency: 'SGD' });
    const ratePrompter = mkPrompter(0.29);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'SGD', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(ratePrompter.requestRate).not.toHaveBeenCalled();
    expect(setRateHint).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number; source: string };
      expect(parsed.rate).toBe(1);
      expect(parsed.source).toBe('identity');
    }
  });

  it('rejects currency codes outside the 9-code allow-list (without prompting)', async () => {
    const g = mkGroup();
    const ratePrompter = mkPrompter(1);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(
      g,
      { from: 'XYZ' as unknown as 'USD', to: 'SGD' },
      { ratePrompter, setRateHint },
    );
    expect(res.ok).toBe(false);
    expect(ratePrompter.requestRate).not.toHaveBeenCalled();
  });

  it('user-submitted zero/negative rate falls back to rateHints (positivity check in executor)', async () => {
    const g = mkGroup({ baseCurrency: 'SGD', rateHints: { MYR: 0.3 } });
    const ratePrompter = mkPrompter(0);
    const setRateHint = vi.fn();
    const res = await executeLookupFxRate(g, { from: 'MYR', to: 'SGD' }, { ratePrompter, setRateHint });
    expect(setRateHint).not.toHaveBeenCalled();
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { rate: number; source: string };
      expect(parsed.rate).toBe(0.3);
      expect(parsed.source).toBe('rateHints');
    }
  });
});
