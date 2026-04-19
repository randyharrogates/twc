---
name: review-test
description: Use when the user asks you to review a Vitest test in TWC, or after writing a test and wanting a focused quality pass. Applies the writing-tests checklist — parametrized inputs, non-trivial asserts, independent expected values, cross-currency coverage.
allowed-tools: Read, Grep, Glob
---

# review-test — writing-tests checklist, TWC edition

One test at a time. The question is always: **can this test fail for a real defect?** If not, it's noise; rewrite or delete.

## 1. Parametrized inputs, no unexplained literals

`"alice"`, `"USD"`, `1000`, `0.5` embedded raw in the test body are smells. Hoist to named constants or a fixture helper that documents what the number means. `1000` is fine; `amountMinor: 1000` (labeled 10.00 USD) is clearer.

## 2. Behavior-named, not function-shape-named

- Good: `"distributes remainder cents to earliest participants"`.
- Bad: `"test distributeRemainder"`.

If the description and the final assert don't match, one of them is wrong. Rename or rewrite.

## 3. Expected values are independent

Never reuse the function under test to produce the expected value. Compute by hand in the test, or derive from a fixed spec constant, and assert equality.

```ts
// bad — circular
expect(computeShares(e)).toEqual(computeShares(e));

// good — hand-computed
// 10.00 USD split three ways → [334, 333, 333] (largest remainder to earliest)
expect(computeShares(e)).toEqual(new Map([[a, 334], [b, 333], [c, 333]]));
```

## 4. Strong assertions against exact values

`toBe` / `toEqual` against the exact integer minor-unit amount. `toBeDefined`, `toBeTruthy`, `toBeGreaterThan(0)` on amounts are almost always too weak — they'll pass even when the math is wrong by one.

Use inequality only when testing an ordering invariant (e.g. largest-remainder gives the remainder to the *first* participant deterministically).

## 5. Cross-currency coverage

FX conversion, rounding distribution, and settlement tests **must** exercise both:

- **0-decimal currencies** (JPY, KRW, TWD) — where a one-unit rounding error is ¥1 or ₩1.
- **2-decimal currencies** (USD, EUR, GBP, SGD, MYR, THB) — where a one-unit rounding error is a cent.

Cross-decimal conversions (e.g. USD↔JPY) are TWC's highest-bug-density zone. If a test file under `src/test/` touches FX or rounding and only exercises one side, that's a gap.

## 6. TWC invariant coverage

When testing split or settlement logic, at minimum assert:

- `Σ computeShares(e).values() === e.amountMinor` for every mode.
- `Σ balances === 0` in base-currency minor units for the settlement case.
- A **payer-not-in-split** case (payer funds the expense but doesn't consume it).
- A **remainder** case (amount not evenly divisible) for proportional modes.

## 7. No type-level duplication

TypeScript already enforces that `amountMinor: number` and `currency: CurrencyCode` are typed. Tests that reassert those are noise — focus on behavior.

## 8. Placement and organization

- Tests live under `src/test/` mirroring `src/`. `src/lib/money.ts` → `src/test/money.test.ts`.
- No snapshot tests for pure logic.
- Assembled-expense integration tests live in `src/test/settlement.test.ts`; keep them readable — named members, explicit amounts, commented units.

## 9. Determinism

`Date.now()`, `Math.random`, and `crypto.randomUUID()` inside a test body make it flaky. For time, pass `nowMs` in; for IDs, build a small fixture helper or use deterministic strings. `src/lib/id.ts` is the only sanctioned ID source in production; tests can override it.

## Output

For each test reviewed: file:line, **blocker / major / minor**, what's weak, what to change. End with one line: can this test fail for a real defect — yes / no.
