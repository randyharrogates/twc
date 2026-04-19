---
name: review-function
description: Use when the user asks you to review a specific function in TWC, or after writing a non-trivial function and wanting a focused quality pass. Applies readability, complexity, testability, and TWC invariants to one function at a time.
allowed-tools: Read, Grep, Glob
---

# review-function — writing-functions checklist, TWC edition

One function at a time. If the function is a single-line fix or a rename, skip the review.

## 1. Can a fresh reader follow it top-to-bottom?

If yes, stop — the function is probably fine. The other checks matter less than honest readability. Only keep going if the answer is no or unclear.

## 2. Complexity

More than three levels of nested `if`, or more than ~10 independent paths, is a refactor signal. Early returns, guard clauses, and small helpers (not nested functions — hoist them to module scope or a class method) fix most cases.

## 3. TWC money / currency rules

- Is every amount an integer minor unit? Any `number` that looks like a float-priced amount outside `src/lib/currency.ts` is a red flag.
- Currencies, symbols, and decimal counts come from `CURRENCIES` in `src/lib/currency.ts`. A hardcoded `"$"`, `"USD"`, or `.toFixed(2)` outside that file is a bug.
- Proportional distribution uses the largest-remainder helper in `src/lib/money.ts`. A hand-rolled `Math.round(a * pct)` loop will drift off `Σ === total` on a remainder case.

## 4. Pure-lib boundary

A function in `src/lib/**` must be deterministic given its inputs. No React, no DOM, no `localStorage`, no `Date.now()` without a `nowMs` parameter. If this function lives under `src/lib/` and touches any of those, move the side-effect up to a caller.

## 5. Unused params and hidden dependencies

- Parameters never referenced in the body — delete them.
- Lookups into env, `localStorage`, or module-level singletons that should be arguments — lift them to the signature. Hidden dependencies make tests require setup they shouldn't.

## 6. Testable without mocking `src/lib/`

A good TWC function can be exercised with real inputs and real outputs. If a test against it requires mocking `src/lib/currency.ts` or `src/lib/splits.ts`, the function shape is wrong — split the impure shell from the pure core.

## 7. Hooks and components (if applicable)

- Hooks obey the rules of hooks — called at the top level, never conditionally.
- `useEffect` deps are complete and stable. A function recreated each render belongs in `useCallback`, or the effect should depend on a stable primitive.
- No `set()` on the Zustand store outside `store.ts`. Components read via selectors and call actions.
- Named export (except `App.tsx`). No default export.

## 8. Naming

Verb-first for actions, domain vocabulary over generic words. Brainstorm two alternatives and check the current name is the clearest. Avoid `process`, `handle`, `doX`. For TWC: `computeShares`, `settle`, `convertToBaseMinor`, `draftFromPrompt` are the shape.

## 9. Interface contract

Every method call on a passed object or store must exist on the target. Before trusting a `store.someAction(...)` or `client.parse(...)`, confirm the action/method is actually defined. Copy-paste from an older shape is a common source of runtime `TypeError`.

## Should this be extracted?

Usually no. Extract only when one of these is true:

- The same logic is about to appear in a second call site (not the first).
- The pure core is hard to test without extraction, and integration-testing through the caller isn't practical.
- The function genuinely does two unrelated things (e.g. computes shares **and** writes to the store) — split along that seam.

Otherwise keep it inline. A three-line helper referenced once is noise.

## Output

For each issue: file:line, **blocker / major / minor**, what's wrong, what to do. End with a one-line verdict: ready / needs changes.
