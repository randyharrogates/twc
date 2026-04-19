import { describe, expect, it, vi } from 'vitest';
import { executeResolvePayer, resolvePayerTool } from '../../../lib/llm/tools/resolve_payer';
import type { PayerPrompter } from '../../../lib/llm/agent';
import type { Group } from '../../../types';

function mkGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Bali Trip',
    baseCurrency: 'SGD',
    createdAt: 0,
    members: [
      { id: 'm-randy', name: 'Randy' },
      { id: 'm-marcus', name: 'Marcus' },
      { id: 'm-alice', name: 'Alice' },
    ],
    expenses: [],
    rateHints: {},
    ...overrides,
  };
}

function mkPrompter(payerId: string | null): PayerPrompter & {
  requestPayer: ReturnType<typeof vi.fn>;
} {
  const requestPayer = vi.fn().mockResolvedValue({ payerId });
  return { requestPayer } as PayerPrompter & { requestPayer: ReturnType<typeof vi.fn> };
}

describe('resolvePayerTool spec', () => {
  it('is read-only and named resolve_payer', () => {
    const spec = resolvePayerTool();
    expect(spec.name).toBe('resolve_payer');
    expect(spec.mutating).toBe(false);
  });
});

describe('executeResolvePayer', () => {
  it('forwards description/amount/currency and the active group members to the prompter', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-randy');
    await executeResolvePayer(
      g,
      { description: 'Carabao dinner', amountMinor: 12345, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(prompter.requestPayer).toHaveBeenCalledTimes(1);
    expect(prompter.requestPayer).toHaveBeenCalledWith({
      description: 'Carabao dinner',
      amountMinor: 12345,
      currency: 'SGD',
      members: g.members,
    });
  });

  it('returns the picked payerId on the happy path', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-marcus');
    const res = await executeResolvePayer(
      g,
      { description: 'NRC Bukit Indah', amountMinor: 500, currency: 'MYR' },
      { payerPrompter: prompter },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { payerId: string | null };
      expect(parsed.payerId).toBe('m-marcus');
    }
  });

  it('returns payerId:null when the user cancels the picker', async () => {
    const g = mkGroup();
    const prompter = mkPrompter(null);
    const res = await executeResolvePayer(
      g,
      { description: 'Taxi', amountMinor: 2000, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const parsed = JSON.parse(res.content) as { payerId: string | null };
      expect(parsed.payerId).toBeNull();
    }
  });

  it('handles a 0-decimal currency (JPY 500) without mutation of the amount', async () => {
    const g = mkGroup({ baseCurrency: 'JPY' });
    const prompter = mkPrompter('m-alice');
    await executeResolvePayer(
      g,
      { description: 'Ramen', amountMinor: 500, currency: 'JPY' },
      { payerPrompter: prompter },
    );
    expect(prompter.requestPayer).toHaveBeenCalledWith({
      description: 'Ramen',
      amountMinor: 500,
      currency: 'JPY',
      members: g.members,
    });
  });

  it('rejects currency codes outside the 9-code allow-list (without prompting)', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-randy');
    const res = await executeResolvePayer(
      g,
      { description: 'x', amountMinor: 100, currency: 'XYZ' as unknown as 'USD' },
      { payerPrompter: prompter },
    );
    expect(res.ok).toBe(false);
    expect(prompter.requestPayer).not.toHaveBeenCalled();
  });

  it('rejects non-positive integer amountMinor (without prompting)', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-randy');
    const zero = await executeResolvePayer(
      g,
      { description: 'x', amountMinor: 0, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(zero.ok).toBe(false);
    const fractional = await executeResolvePayer(
      g,
      { description: 'x', amountMinor: 1.5, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(fractional.ok).toBe(false);
    expect(prompter.requestPayer).not.toHaveBeenCalled();
  });

  it('rejects empty description and over-long description (without prompting)', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-randy');
    const empty = await executeResolvePayer(
      g,
      { description: '', amountMinor: 100, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(empty.ok).toBe(false);
    const longDesc = 'x'.repeat(201);
    const long = await executeResolvePayer(
      g,
      { description: longDesc, amountMinor: 100, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(long.ok).toBe(false);
    expect(prompter.requestPayer).not.toHaveBeenCalled();
  });

  it('rejects a payerId that is not in the active group members', async () => {
    const g = mkGroup();
    const prompter = mkPrompter('m-outsider');
    const res = await executeResolvePayer(
      g,
      { description: 'Taxi', amountMinor: 100, currency: 'SGD' },
      { payerPrompter: prompter },
    );
    expect(res.ok).toBe(false);
  });
});
