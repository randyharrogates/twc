import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../state/store';
import type { ChatMessage } from '../lib/llm/types';

function reset() {
  useAppStore.getState().resetAll();
  // Persist middleware writes to jsdom localStorage; clear it to avoid cross-test bleed.
  localStorage.clear();
}

describe('store groups + members', () => {
  beforeEach(reset);

  it('creates a group and makes it active by default', () => {
    const id = useAppStore.getState().createGroup('Tokyo Trip', 'JPY');
    const s = useAppStore.getState();
    expect(s.groupOrder).toEqual([id]);
    expect(s.activeGroupId).toBe(id);
    expect(s.groups[id].baseCurrency).toBe('JPY');
    expect(s.groups[id].name).toBe('Tokyo Trip');
  });

  it('adds members and rejects empty names', () => {
    const gid = useAppStore.getState().createGroup('G', 'USD');
    const mid = useAppStore.getState().addMember(gid, 'Alice');
    expect(useAppStore.getState().groups[gid].members).toHaveLength(1);
    expect(() => useAppStore.getState().addMember(gid, '  ')).toThrow();
    expect(mid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('blocks deleting a member who is referenced in an expense', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    const b = s.addMember(gid, 'Bob');
    s.addExpense(gid, {
      description: 'Dinner',
      amountMinor: 1000,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [
        { memberId: a, value: 1 },
        { memberId: b, value: 1 },
      ],
    });
    expect(() => useAppStore.getState().deleteMember(gid, a)).toThrow(/referenced/);
  });

  it('allows deleting an unreferenced member', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    s.deleteMember(gid, a);
    expect(useAppStore.getState().groups[gid].members).toHaveLength(0);
  });
});

describe('store expenses', () => {
  beforeEach(reset);

  it('updates rateHints when a non-base-currency expense is added', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'Coffee',
      amountMinor: 500,
      currency: 'USD',
      rateToBase: 150,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(useAppStore.getState().groups[gid].rateHints.USD).toBe(150);
  });

  it('updates and deletes expenses', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    const eid = s.addExpense(gid, {
      description: 'X',
      amountMinor: 100,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    s.updateExpense(gid, eid, {
      description: 'Y',
      amountMinor: 200,
      currency: 'USD',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(useAppStore.getState().groups[gid].expenses[0].description).toBe('Y');
    expect(useAppStore.getState().groups[gid].expenses[0].amountMinor).toBe(200);
    s.deleteExpense(gid, eid);
    expect(useAppStore.getState().groups[gid].expenses).toHaveLength(0);
  });
});

describe('store changeBaseCurrency', () => {
  beforeEach(reset);

  it('rewrites rateToBase for every expense and accepts user-supplied rates', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'yen item',
      amountMinor: 1000,
      currency: 'JPY',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    s.addExpense(gid, {
      description: 'usd item',
      amountMinor: 100,
      currency: 'USD',
      rateToBase: 150,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    // Switch base to USD. JPY needs a new rate; USD becomes 1.
    s.changeBaseCurrency(gid, 'USD', { JPY: 0.0066 });
    const g = useAppStore.getState().groups[gid];
    expect(g.baseCurrency).toBe('USD');
    expect(g.expenses[0].rateToBase).toBe(0.0066);
    expect(g.expenses[1].rateToBase).toBe(1);
  });

  it('throws when a needed rate is missing', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'JPY');
    const a = s.addMember(gid, 'Alice');
    s.addExpense(gid, {
      description: 'x',
      amountMinor: 1000,
      currency: 'JPY',
      rateToBase: 1,
      payerId: a,
      splitMode: 'even',
      split: [{ memberId: a, value: 1 }],
    });
    expect(() => useAppStore.getState().changeBaseCurrency(gid, 'USD', {})).toThrow();
  });
});

function buildMessage(id: string, drafts: ChatMessage['drafts'] = []): ChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: 'hi' }],
    createdAt: 1000,
    drafts,
  };
}

describe('store passphrase vault', () => {
  beforeEach(reset);

  it('setupVault encrypts existing plaintext keys in place and unlocks the session', async () => {
    const s = useAppStore.getState();
    await s.setApiKey('anthropic', 'sk-ant-plain');
    expect(useAppStore.getState().settings.apiKeys.anthropic).toBe('sk-ant-plain');
    await useAppStore.getState().setupVault('correct horse battery staple');
    const after = useAppStore.getState();
    expect(after.settings.vault).not.toBeNull();
    expect(after.vaultUnlocked).toBe(true);
    expect(after.settings.apiKeys.anthropic?.startsWith('enc.v1.')).toBe(true);
    // Exported state never contains plaintext, and the vault meta is preserved.
    expect(after.exportState()).not.toContain('sk-ant-plain');
  });

  it('lockVault clears the in-memory key; unlockVault with the right passphrase restores use', async () => {
    const s = useAppStore.getState();
    await s.setApiKey('openai', 'sk-openai-plain');
    await useAppStore.getState().setupVault('pass-1');
    useAppStore.getState().lockVault();
    expect(useAppStore.getState().vaultUnlocked).toBe(false);
    await useAppStore.getState().unlockVault('pass-1');
    expect(useAppStore.getState().vaultUnlocked).toBe(true);
  });

  it('unlockVault with the wrong passphrase throws and leaves session locked', async () => {
    await useAppStore.getState().setupVault('pass-1');
    useAppStore.getState().lockVault();
    await expect(useAppStore.getState().unlockVault('wrong')).rejects.toThrow(
      /passphrase is incorrect/i,
    );
    expect(useAppStore.getState().vaultUnlocked).toBe(false);
  });

  it('wipeVault clears vault meta AND all apiKeys', async () => {
    const s = useAppStore.getState();
    await s.setApiKey('anthropic', 'sk-ant-plain');
    await useAppStore.getState().setupVault('pass-1');
    useAppStore.getState().wipeVault();
    const after = useAppStore.getState();
    expect(after.settings.vault).toBeNull();
    expect(after.settings.apiKeys).toEqual({});
    expect(after.vaultUnlocked).toBe(false);
  });

  it('setApiKey throws when the vault is set up but locked', async () => {
    await useAppStore.getState().setupVault('pass-1');
    useAppStore.getState().lockVault();
    await expect(useAppStore.getState().setApiKey('anthropic', 'sk-new')).rejects.toThrow(
      /unlock/i,
    );
  });
});

describe('store settings slice', () => {
  beforeEach(reset);

  it('stores, clears, and masks API keys; keys do not appear in exportState', async () => {
    const s = useAppStore.getState();
    await s.setApiKey('anthropic', 'sk-ant-secret');
    s.setLLMProvider('anthropic');
    const after = useAppStore.getState();
    expect(after.settings.apiKeys.anthropic).toBe('sk-ant-secret');
    const exported = after.exportState();
    expect(exported).not.toContain('sk-ant-secret');
    s.clearApiKey('anthropic');
    expect(useAppStore.getState().settings.apiKeys.anthropic).toBeUndefined();
  });

  it('defaults llmProvider to openai on a fresh store', () => {
    expect(useAppStore.getState().settings.llmProvider).toBe('openai');
  });

  it('consumeRateToken decrements the bucket and persists state across calls', () => {
    const s = useAppStore.getState();
    s.setRateLimits({ perMinuteMax: 2, perHourMax: 10 });
    const r1 = s.consumeRateToken(0);
    expect(r1.ok).toBe(true);
    const r2 = useAppStore.getState().consumeRateToken(100);
    expect(r2.ok).toBe(true);
    const r3 = useAppStore.getState().consumeRateToken(200);
    expect(r3.ok).toBe(false);
  });
});

describe('store conversation slice', () => {
  beforeEach(reset);

  it('appendMessage adds a message and strips image bytes when persisted', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const msg: ChatMessage = {
      id: 'm1',
      role: 'user',
      blocks: [
        { type: 'text', text: 'here is a receipt' },
        { type: 'image', mediaType: 'image/jpeg', base64: 'HEAVYBASE64' },
      ],
      createdAt: 1,
    };
    s.appendMessage(gid, msg);
    const conv = useAppStore.getState().conversations[gid];
    expect(conv.messages).toHaveLength(1);
    const stored = conv.messages[0].blocks.find((b) => b.type === 'image');
    expect(stored && stored.type === 'image' ? stored.base64 : '??').toBe('');
  });

  it('acceptDrafts creates one expense per selected draft via addExpense', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const a = s.addMember(gid, 'Alice');
    const b = s.addMember(gid, 'Bob');
    const msg = buildMessage('m1', [
      {
        description: 'Coffee',
        amountMinor: 400,
        currency: 'USD',
        rateToBase: 1,
        payerId: a,
        splitMode: 'even',
        split: [
          { memberId: a, value: 1 },
          { memberId: b, value: 1 },
        ],
      },
    ]);
    s.appendMessage(gid, msg);
    const ids = useAppStore.getState().acceptDrafts(gid, 'm1', [0]);
    expect(ids).toHaveLength(1);
    expect(useAppStore.getState().groups[gid].expenses).toHaveLength(1);
  });

  it('clearConversation empties the group\'s thread without touching other groups', () => {
    const s = useAppStore.getState();
    const g1 = s.createGroup('A', 'USD');
    const g2 = s.createGroup('B', 'USD');
    s.appendMessage(g1, buildMessage('m1'));
    s.appendMessage(g2, buildMessage('m2'));
    s.clearConversation(g1);
    expect(useAppStore.getState().conversations[g1].messages).toHaveLength(0);
    expect(useAppStore.getState().conversations[g2].messages).toHaveLength(1);
  });

  it('deleteGroup cascades to the group\'s conversation and its cost entries', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    s.appendMessage(gid, buildMessage('m1'));
    s.recordCost('m1', { inputTokens: 100, outputTokens: 50 }, 'claude-haiku-4-5', 1000);
    const other = s.createGroup('Other', 'USD');
    s.appendMessage(other, buildMessage('other-msg'));
    s.recordCost('other-msg', { inputTokens: 10, outputTokens: 5 }, 'claude-haiku-4-5', 1000);
    s.deleteGroup(gid);
    const after = useAppStore.getState();
    expect(after.conversations[gid]).toBeUndefined();
    const ids = after.costTracker.perMessage.map((c) => c.messageId);
    expect(ids).toContain('other-msg');
    expect(ids).not.toContain('m1');
  });
});

describe('store persistHistory gate', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('does not persist the conversations slice to localStorage when persistHistory is false', () => {
    const s = useAppStore.getState();
    s.setPersistHistory(false);
    const gid = s.createGroup('G', 'USD');
    s.appendMessage(gid, buildMessage('m1'));
    const raw = localStorage.getItem('twc-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { state: { conversations: Record<string, unknown> } };
    expect(parsed.state.conversations).toEqual({});
  });

  it('persists the conversations slice when persistHistory is true (default)', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    s.appendMessage(gid, buildMessage('m1'));
    const raw = localStorage.getItem('twc-v1');
    const parsed = JSON.parse(raw as string) as { state: { conversations: Record<string, unknown> } };
    expect(Object.keys(parsed.state.conversations)).toContain(gid);
  });

  it('strips image bytes from any persisted message regardless of persistHistory', () => {
    const s = useAppStore.getState();
    const gid = s.createGroup('G', 'USD');
    const imageMsg: ChatMessage = {
      id: 'img1',
      role: 'user',
      blocks: [
        { type: 'text', text: 'receipt' },
        { type: 'image', mediaType: 'image/jpeg', base64: 'HEAVYBASE64'.repeat(50) },
      ],
      createdAt: 1,
    };
    s.appendMessage(gid, imageMsg);
    const raw = localStorage.getItem('twc-v1');
    expect(raw).not.toBeNull();
    expect(raw as string).not.toContain('HEAVYBASE64HEAVYBASE64');
  });
});

describe('store policy slice', () => {
  beforeEach(reset);

  it('grants per-provider image consent independently', () => {
    const s = useAppStore.getState();
    s.grantImageConsent('anthropic');
    const p = useAppStore.getState().policy;
    expect(p.imageConsentByProvider.anthropic).toBe(true);
    expect(p.imageConsentByProvider.openai).toBe(false);
  });

  it('setDailyCap/setMonthlyCap floor and clamp to >= 0', () => {
    const s = useAppStore.getState();
    s.setDailyCap(-100);
    s.setMonthlyCap(1_234.56);
    const p = useAppStore.getState().policy;
    expect(p.dailyCapUsdMicros).toBe(0);
    expect(p.monthlyCapUsdMicros).toBe(1234);
  });
});

describe('store migration v2 → v3', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('rewrites a persisted llmProvider of "mock" to "openai"', () => {
    const v2 = {
      state: {
        groups: {},
        groupOrder: [],
        activeGroupId: null,
        settings: {
          llmProvider: 'mock',
          apiKeys: {},
          modelOverride: null,
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {},
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 2,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v2));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.settings.llmProvider).toBe('openai');
  });

  it('leaves a persisted llmProvider of "anthropic" untouched', () => {
    const v2 = {
      state: {
        groups: {},
        groupOrder: [],
        activeGroupId: null,
        settings: {
          llmProvider: 'anthropic',
          apiKeys: { anthropic: 'sk-ant-x' },
          modelOverride: null,
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {},
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 2,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v2));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.settings.llmProvider).toBe('anthropic');
    expect(s.settings.apiKeys.anthropic).toBe('sk-ant-x');
  });
});

describe('store planMode setting', () => {
  beforeEach(reset);

  it('defaults planMode to false on a fresh store', () => {
    expect(useAppStore.getState().settings.planMode).toBe(false);
  });

  it('setPlanMode(true) flips the flag and persists it under twc-v1', () => {
    const s = useAppStore.getState();
    s.setPlanMode(true);
    expect(useAppStore.getState().settings.planMode).toBe(true);
    const raw = localStorage.getItem('twc-v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: { settings: { planMode?: boolean } };
      version: number;
    };
    expect(parsed.state.settings.planMode).toBe(true);
    expect(parsed.version).toBe(9);
  });

  it('setPlanMode(false) flips the flag back', () => {
    const s = useAppStore.getState();
    s.setPlanMode(true);
    s.setPlanMode(false);
    expect(useAppStore.getState().settings.planMode).toBe(false);
  });
});

describe('store migration v4 → v5 (planMode)', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('fills planMode=false for a persisted v4 blob that lacks the field', () => {
    const v4 = {
      state: {
        groups: {},
        groupOrder: [],
        activeGroupId: null,
        settings: {
          llmProvider: 'openai',
          apiKeys: {},
          modelOverride: null,
          reasoningEffort: 'low',
          // no planMode — pre-v5 shape
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {},
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 4,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v4));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.settings.planMode).toBe(false);
    expect(s.settings.reasoningEffort).toBe('low');
  });

  it('preserves an explicit planMode value from a v5+ blob', () => {
    const v5 = {
      state: {
        groups: {},
        groupOrder: [],
        activeGroupId: null,
        settings: {
          llmProvider: 'openai',
          apiKeys: {},
          modelOverride: null,
          reasoningEffort: 'minimal',
          planMode: true,
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {},
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 5,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v5));
    useAppStore.persist.rehydrate();
    expect(useAppStore.getState().settings.planMode).toBe(true);
  });
});

describe('store migration v5 → v6 (elapsedMs / sentInPlanMode)', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('rehydrates a v5 blob unchanged — old messages simply lack the new fields', () => {
    const v5 = {
      state: {
        groups: {
          g1: {
            id: 'g1',
            name: 'Legacy',
            baseCurrency: 'USD',
            createdAt: 1,
            members: [],
            expenses: [],
            rateHints: {},
          },
        },
        groupOrder: ['g1'],
        activeGroupId: 'g1',
        settings: {
          llmProvider: 'openai',
          apiKeys: {},
          modelOverride: null,
          reasoningEffort: 'minimal',
          planMode: false,
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {
          g1: {
            messages: [
              {
                id: 'legacy-msg',
                role: 'assistant',
                blocks: [{ type: 'text', text: 'old reply' }],
                createdAt: 5,
                // no elapsedMs, no sentInPlanMode
              },
            ],
            updatedAt: 5,
            injectionBannerDismissed: false,
          },
        },
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 5,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v5));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    const msg = s.conversations.g1?.messages[0];
    expect(msg?.id).toBe('legacy-msg');
    expect(msg?.elapsedMs).toBeUndefined();
    expect(msg?.sentInPlanMode).toBeUndefined();
    expect(s.groups.g1?.name).toBe('Legacy');
  });
});

describe('store migration v3 → v4 (reasoningEffort)', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('fills in reasoningEffort="minimal" for a persisted v3 blob that lacks it', () => {
    const v3 = {
      state: {
        groups: {},
        groupOrder: [],
        activeGroupId: null,
        settings: {
          llmProvider: 'openai',
          apiKeys: {},
          modelOverride: null,
          // no reasoningEffort field — pre-v4 shape
          rateLimiter: { perMinute: [], perHour: [] },
          rateLimits: { perMinuteMax: 10, perHourMax: 100 },
          retryConfig: { maxRetries: 3, baseDelayMs: 500 },
        },
        conversations: {},
        policy: {
          allowedProviders: [],
          dailyCapUsdMicros: 5_000_000,
          monthlyCapUsdMicros: 50_000_000,
          imageConsentByProvider: { anthropic: false, openai: false },
          persistHistory: true,
        },
        costTracker: { dailyUsdMicros: {}, monthlyUsdMicros: {}, perMessage: [] },
      },
      version: 3,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v3));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.settings.reasoningEffort).toBe('minimal');
  });
});

describe('store migration v1 → v3', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    localStorage.clear();
  });

  it('seeds a v1 payload under twc-v1 and preserves groups while adding default slices', () => {
    const v1 = {
      state: {
        groups: {
          'g1': {
            id: 'g1',
            name: 'Legacy Group',
            baseCurrency: 'USD',
            createdAt: 100,
            members: [{ id: 'a', name: 'Alice' }],
            expenses: [],
            rateHints: {},
          },
        },
        groupOrder: ['g1'],
        activeGroupId: 'g1',
      },
      version: 1,
    };
    localStorage.setItem('twc-v1', JSON.stringify(v1));
    useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.groups.g1?.name).toBe('Legacy Group');
    expect(s.groupOrder).toEqual(['g1']);
    expect(s.conversations).toEqual({});
    expect(s.policy.dailyCapUsdMicros).toBe(5_000_000);
    expect(s.settings.llmProvider).toBe('openai');
    expect(s.costTracker.perMessage).toEqual([]);
  });
});

describe('store selector stability', () => {
  beforeEach(reset);

  it('useAppStore ref equality — calling the same selector twice with the same state returns identical slice references', () => {
    const s = useAppStore.getState();
    const policy1 = useAppStore.getState().policy;
    const policy2 = useAppStore.getState().policy;
    expect(policy1).toBe(policy2);
    const settings1 = s.settings;
    const settings2 = useAppStore.getState().settings;
    expect(settings1).toBe(settings2);
  });
});

describe('store costTracker slice', () => {
  beforeEach(reset);

  it('recordCost adds to daily, monthly, and perMessage atomically', () => {
    const s = useAppStore.getState();
    const now = Date.parse('2026-04-18T12:00:00Z');
    const micros = s.recordCost('m1', { inputTokens: 1500, outputTokens: 400 }, 'claude-haiku-4-5', now);
    expect(micros).toBe(1500 + 2000);
    const ct = useAppStore.getState().costTracker;
    expect(ct.dailyUsdMicros['2026-04-18']).toBe(micros);
    expect(ct.monthlyUsdMicros['2026-04']).toBe(micros);
    expect(ct.perMessage).toHaveLength(1);
  });

  it('accumulates costs across multiple messages on the same day', () => {
    const s = useAppStore.getState();
    const now = Date.parse('2026-04-18T12:00:00Z');
    s.recordCost('m1', { inputTokens: 1000, outputTokens: 0 }, 'claude-haiku-4-5', now);
    s.recordCost('m2', { inputTokens: 1000, outputTokens: 0 }, 'claude-haiku-4-5', now);
    const ct = useAppStore.getState().costTracker;
    expect(ct.dailyUsdMicros['2026-04-18']).toBe(2000);
  });
});
