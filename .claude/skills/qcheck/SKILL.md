---
name: qcheck
description: Use when the user types 'qcheck' or asks for a skeptical senior-engineer review of a non-trivial TWC change. Checks functions, tests, and TWC invariants in one pass; folds the function- and test-level sub-reviews inline.
---

# qcheck — skeptical review of a TWC change

You're reviewing someone else's work (including your own from ten minutes ago). Question everything non-trivial; skip single-line and rename-only diffs. The goal is to catch bugs and invariant breaches before they land, not to polish style.

Output per issue: file:line, severity (**blocker / major / minor**), what's wrong, what to do.

## 1. TWC invariants — the non-negotiable layer

- **Money minor units** — every amount in stored state, props, and comparisons is an integer minor unit. Any `number` that could be a float-priced amount outside `src/lib/currency.ts`'s FX boundary is a blocker.
- **Currency allow-list** — no code, symbol, or decimal count literal anywhere except `src/lib/currency.ts`. Grep the diff for hardcoded `"USD"`, `"$"`, `100`, `.toFixed(2)`; flag each.
- **Splits** — every new or modified `computeShares` branch returns `Σ === expense.amountMinor`. Test proves it, not the commit message. Proportional branches use the largest-remainder helper; a manual `Math.round(a * pct)` loop is a blocker.
- **Settlement** — `Σ balances === 0` in base-currency minor units, asserted at the top of `settle()`. Removing or weakening that assertion is a blocker.
- **Pure-lib boundary** — any `src/lib/**` file importing React, DOM, `localStorage`, or calling `Date.now()` without injection is a blocker.
- **Zustand** — `set()` called outside `store.ts`, or a persisted-shape change without a version bump and `migrate`, is a blocker.
- **LLM contract** — parseable-but-bad user input must return `{ parseError }`; infra failure throws. Reversed means UI breaks.
- **Files** under 40,000 chars; components under ~200 lines.

## 2. Function-level review (folds `qcheckf`)

For each non-trivial function added or changed:

- Can a fresh reader follow it top-to-bottom without re-reading? If no, ask what to extract or rename.
- Cyclomatic complexity: nested `if`s three levels deep or more than ~10 independent paths = refactor candidate.
- Unused parameters, dead branches, hidden dependencies (`localStorage`, `Date.now`, env lookups) that should be arguments instead.
- Testable without mocking `src/lib/`? `src/lib/` is pure; if a test against it needs a mock, the function shape is wrong.
- React hooks follow the rules of hooks (top-level, stable deps). No conditional hook calls. `useEffect` without a clean dependency array is suspicious.
- **Named exports only** (except `App.tsx`). IDs via `lib/id.ts`.
- Name matches behavior. Generic names (`process`, `handle`, `run`) are a smell unless the function truly is that generic.
- **Interface check** — before trusting a method call, confirm it exists on the target (including Zustand actions on the store and props on a component). Copy-paste from older code is a common source of ghost methods.

## 3. Test-level review (folds `qcheckt`)

For each test added or changed:

- Parametrized inputs — no unexplained `1000`, `"USD"`, `"alice"` literals; use named constants or a test fixture.
- Can fail for a real defect — `expect(x).toBeDefined()` and `expect(x).toBeTruthy()` on an object are almost always too weak.
- Description states exactly what the final assert verifies; behavior-named, not function-shape-named.
- Expected values are **independent** — computed by hand in the test, not by calling the function under test with a different name.
- Strong assertions (`===`/`toBe`/`toEqual` against exact values), not `>`/`<`/`toBeGreaterThan` unless testing an ordering invariant.
- Edge cases covered: cross-currency FX (0-decimal JPY/KRW/TWD × 2-decimal USD/EUR), payer-not-in-split, empty member list, single-participant split, a remainder case for largest-remainder.
- No duplicated type-level checks (TypeScript enforces them).
- Placement: every `src/**/*.ts(x)` that exports logic has a mirrored `src/test/<same-name>.test.ts(x)`. Loose tests outside `src/test/` are misplaced.

## 4. Tooling gates

`npm run lint`, `npm run test`, `npm run build` must all pass. If the reviewer is running checks themselves, run those three and report any failure with the exact error line.

## Output shape

1. Summary — blockers count, majors count, minors count.
2. Invariant findings (if any).
3. Function findings, per function with file:line.
4. Test findings, per test with file:line.
5. Tooling-gate status.
6. Verdict — ready to land, or specific items to fix before landing.
