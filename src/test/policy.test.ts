import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  evaluatePolicy,
  type Policy,
  type CostTrackerSnapshot,
} from '../lib/policy';
import { dayKey, monthKey } from '../lib/llm/cost';

const NOW = Date.parse('2026-04-18T12:00:00Z');

function emptyCosts(): CostTrackerSnapshot {
  return { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] };
}

function policy(overrides: Partial<Policy> = {}): Policy {
  return { ...DEFAULT_POLICY, ...overrides };
}

describe('evaluatePolicy — sendMessage', () => {
  it('denies a provider that is not allow-listed', () => {
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: 1 },
      policy({ allowedProviders: [] }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toMatch(/not enabled/);
  });

  it('allows an allow-listed provider under cap', () => {
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: 10_000 },
      policy({ allowedProviders: ['anthropic'] }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(true);
  });

  it('denies when today + estCost would exceed the daily cap', () => {
    const costs = emptyCosts();
    costs.dailyUsdMicros[dayKey(NOW)] = 4_999_000;
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: 2000 },
      policy({ allowedProviders: ['anthropic'], dailyCapUsdMicros: 5_000_000 }),
      costs,
      NOW,
    );
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toMatch(/daily/);
  });

  it('allows when exactly at the daily cap boundary', () => {
    const costs = emptyCosts();
    costs.dailyUsdMicros[dayKey(NOW)] = 4_999_000;
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: 1000 },
      policy({ allowedProviders: ['anthropic'], dailyCapUsdMicros: 5_000_000 }),
      costs,
      NOW,
    );
    expect(d.allow).toBe(true);
  });

  it('denies when month + estCost would exceed the monthly cap', () => {
    const costs = emptyCosts();
    costs.monthlyUsdMicros[monthKey(NOW)] = 49_999_000;
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: 2000 },
      policy({ allowedProviders: ['anthropic'], monthlyCapUsdMicros: 50_000_000 }),
      costs,
      NOW,
    );
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toMatch(/monthly/);
  });

  it('rejects a negative estCostMicros as defensive input validation', () => {
    const d = evaluatePolicy(
      { kind: 'sendMessage', provider: 'anthropic', estCostMicros: -1 },
      policy({ allowedProviders: ['anthropic'] }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(false);
  });
});

describe('evaluatePolicy — uploadImage', () => {
  it('denies when consent for that provider is false', () => {
    const d = evaluatePolicy(
      { kind: 'uploadImage', provider: 'openai' },
      policy({ imageConsentByProvider: { anthropic: true, openai: false, local: false } }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(false);
  });

  it('allows when consent for that provider is true', () => {
    const d = evaluatePolicy(
      { kind: 'uploadImage', provider: 'anthropic' },
      policy({ imageConsentByProvider: { anthropic: true, openai: false, local: false } }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(true);
  });

  it('tracks consent independently per provider', () => {
    const p = policy({ imageConsentByProvider: { anthropic: true, openai: false, local: false } });
    expect(evaluatePolicy({ kind: 'uploadImage', provider: 'anthropic' }, p, emptyCosts(), NOW).allow).toBe(true);
    expect(evaluatePolicy({ kind: 'uploadImage', provider: 'openai' }, p, emptyCosts(), NOW).allow).toBe(false);
  });
});

describe('evaluatePolicy — persistHistory', () => {
  it('denies when persistHistory is disabled', () => {
    const d = evaluatePolicy(
      { kind: 'persistHistory' },
      policy({ persistHistory: false }),
      emptyCosts(),
      NOW,
    );
    expect(d.allow).toBe(false);
  });

  it('allows when persistHistory is enabled', () => {
    const d = evaluatePolicy({ kind: 'persistHistory' }, policy({ persistHistory: true }), emptyCosts(), NOW);
    expect(d.allow).toBe(true);
  });
});
