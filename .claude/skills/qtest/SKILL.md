---
name: qtest
description: Use when the user types 'qtest', when a test file is created/renamed/deleted, or after a `qcode` run to confirm test placement. Verifies Vitest files mirror `src/**` under `src/test/` one-to-one, and flags loose tests.
---

# qtest — test placement check

TWC keeps one rule for tests: **`src/test/` mirrors `src/`**. `src/lib/foo.ts` → `src/test/foo.test.ts`. Every exported unit of logic has a test file next to it in the mirrored layout; nothing lives outside `src/test/`.

## What to check

1. **No loose tests.** Anything matching `src/**/*.test.ts(x)` outside `src/test/` is misplaced and must be moved. List each one.
2. **Every source file that exports logic has a mirrored test.** Walk `src/lib/**/*.ts`, `src/state/**/*.ts`, and any `src/components/**` file that exports non-trivial pure logic. For each, confirm `src/test/<same-relative-path>.test.ts(x)` exists. Pure presentational components and type-only files (`types.ts`, `index.ts` barrels) don't need a mirror.
3. **Naming is behavior-based, not function-shape-based.** `"distributes remainder to earliest participants"` is right; `"test distributeRemainder"` is wrong.
4. **Cross-decimal coverage.** Tests in `currency.test.ts`, `money.test.ts`, `splits.test.ts`, and `settlement.test.ts` must exercise both 0-decimal currencies (JPY/KRW/TWD) and 2-decimal currencies (USD/EUR/…). Flag any of those files that lack one side.
5. **Vitest only.** No Jest, no snapshot tests for pure logic. Integration-style assembled-expense tests belong in `src/test/settlement.test.ts`.

## Report shape

```
## Test placement report

### Correctly placed
- N files mirror their source under src/test/

### Misplaced
- src/lib/foo.test.ts → move to src/test/foo.test.ts
  (reason: tests imports from src/lib/foo.ts)

### Missing mirror
- src/lib/bar.ts has no src/test/bar.test.ts
  (reason: exports pure logic — every exported function in src/lib needs a test)

### Cross-decimal gaps
- src/test/currency.test.ts covers USD/EUR but no JPY or KRW

### Naming smells
- src/test/splits.test.ts:42 — "test computeShares even" should describe behavior
```

If everything passes, say so in one line.

## Rules reminder

- `src/lib/` is pure — no React, no DOM, no `localStorage`, no `Date.now()` without injection. Tests that need to mock any of those in a lib-level test are a signal the function shape is wrong, not that the test needs more setup.
- Assert exact values. `expect(result).toBeTruthy()` on a number is almost always the wrong strength.
