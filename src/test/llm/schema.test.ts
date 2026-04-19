import { describe, expect, it } from 'vitest';
import { AssistantResponseSchema, ExpenseDraftSchema, toJsonSchema, walkSchema } from '../../lib/llm/schema';
import { CURRENCY_CODES } from '../../lib/currency';

const memberIds = ['a', 'b', 'c'];
const ALL_CURRENCIES = CURRENCY_CODES;

describe('ExpenseDraftSchema', () => {
  const draft = (overrides: Record<string, unknown> = {}) => ({
    description: 'dinner',
    amountMinor: 5000,
    currency: 'USD',
    rateToBase: 1,
    payerId: 'a',
    splitMode: 'even',
    split: [
      { memberId: 'a', value: 1 },
      { memberId: 'b', value: 1 },
      { memberId: 'c', value: 1 },
    ],
    unresolvedNames: [],
    ...overrides,
  });

  it('accepts a valid draft for every currency in CURRENCIES', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    for (const code of ALL_CURRENCIES) {
      const res = schema.safeParse(draft({ currency: code }));
      expect(res.success).toBe(true);
    }
  });

  it('rejects a non-integer amountMinor', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ amountMinor: 12.5 })).success).toBe(false);
  });

  it('rejects zero and negative amountMinor', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ amountMinor: 0 })).success).toBe(false);
    expect(schema.safeParse(draft({ amountMinor: -1 })).success).toBe(false);
  });

  it('rejects payerId not in the provided memberIds', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ payerId: 'zz' })).success).toBe(false);
  });

  it('rejects unknown splitMode', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ splitMode: 'weighted' })).success).toBe(false);
  });

  it('rejects split entries with an unknown memberId', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(
      schema.safeParse(draft({ split: [{ memberId: 'zz', value: 1 }] })).success,
    ).toBe(false);
  });

  it('rejects unknown currency codes', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ currency: 'BTC' })).success).toBe(false);
  });

  it('rejects extra properties on the root draft (strict)', () => {
    const schema = ExpenseDraftSchema(memberIds, ALL_CURRENCIES);
    expect(schema.safeParse(draft({ extra: 1 })).success).toBe(false);
  });
});

describe('AssistantResponseSchema', () => {
  it('accepts an empty drafts array with assistantText', () => {
    const schema = AssistantResponseSchema(memberIds, ALL_CURRENCIES);
    expect(
      schema.safeParse({ assistantText: 'ok', drafts: [] }).success,
    ).toBe(true);
  });
});

describe('toJsonSchema', () => {
  it('emits additionalProperties: false on every nested object and lists every property in required', () => {
    const js = toJsonSchema(AssistantResponseSchema(memberIds, ALL_CURRENCIES));
    walkSchema(js, (node) => {
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        const props = (node.properties ?? {}) as Record<string, unknown>;
        const required = (node.required ?? []) as string[];
        for (const k of Object.keys(props)) {
          expect(required).toContain(k);
        }
      }
    });
  });

  it('strips $schema for a cleaner provider request body', () => {
    const js = toJsonSchema(AssistantResponseSchema(memberIds, ALL_CURRENCIES));
    expect(js.$schema).toBeUndefined();
  });

  it('exposes drafts as an array of expense objects at the top level', () => {
    const js = toJsonSchema(AssistantResponseSchema(memberIds, ALL_CURRENCIES)) as Record<string, unknown>;
    const props = js.properties as Record<string, unknown>;
    expect((props.drafts as Record<string, unknown>).type).toBe('array');
    expect((props.assistantText as Record<string, unknown>).type).toBe('string');
  });

  it('never emits boolean exclusiveMinimum or exclusiveMaximum (OpenAI rejects draft-04 form)', () => {
    const js = toJsonSchema(AssistantResponseSchema(memberIds, ALL_CURRENCIES));
    walkSchema(js, (node) => {
      if ('exclusiveMinimum' in node) {
        expect(typeof node.exclusiveMinimum).not.toBe('boolean');
      }
      if ('exclusiveMaximum' in node) {
        expect(typeof node.exclusiveMaximum).not.toBe('boolean');
      }
    });
  });

  it('emits rateToBase with a numeric exclusiveMinimum of 0 and no redundant minimum', () => {
    const js = toJsonSchema(AssistantResponseSchema(memberIds, ALL_CURRENCIES)) as Record<string, unknown>;
    const rootProps = js.properties as Record<string, unknown>;
    const draftsNode = rootProps.drafts as Record<string, unknown>;
    const itemNode = draftsNode.items as Record<string, unknown>;
    const draftProps = itemNode.properties as Record<string, unknown>;
    const rateToBase = draftProps.rateToBase as Record<string, unknown>;
    expect(rateToBase.exclusiveMinimum).toBe(0);
    expect(rateToBase.minimum).toBeUndefined();
  });
});
