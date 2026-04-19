---
name: qcode
description: Use when the user types 'qcode' or has approved an implementation plan and is ready for edits. Drives a TDD loop against TWC's invariants, ends with `npm run lint`, `npm run test`, and `npm run build` all green.
---

# qcode — TDD implementation with lint / test / build gates

Execute the plan the user approved in `qthink` (or equivalent). Do not expand scope silently; if a real change of direction is needed, stop and go back to `qthink`.

## Flow

1. **Find or scaffold the test file.** For a change under `src/lib/foo.ts`, the test is `src/test/foo.test.ts`. If it already exists, extend it; otherwise create it. Vitest only. Tests live under `src/test/` — never loose alongside source.
2. **Write the failing test first.** Behavior-named (`"distributes remainder cents to earliest participants"`), exact-value asserts, independent expected values. Cover 0-decimal (JPY/KRW/TWD) and 2-decimal (USD/EUR/etc) currencies when FX or rounding is involved.
3. **Run it and watch it fail** (`npm run test`). If it passes before the change, the test is not exercising the new behavior.
4. **Implement the minimum that makes it green.** No speculative features, no extra abstraction. Components stay under ~200 lines; if the edit pushes past, break it up.
5. **Re-run `npm run test`** and confirm green — including previously passing tests.
6. **Run the tooling gates.** `npm run lint`, then `npm run test`, then `npm run build`. All three must pass before the task is done. Fix real issues; don't silence warnings.
7. **Update docs alongside the code.** Root `CLAUDE.md`, the nearest subdirectory `CLAUDE.md`, `README.md`, or any skill whose checklist is now stale. If none need updating, say so explicitly in the summary.

## Rules while coding

- **Money stays in integer minor units.** Floats only at the FX boundary in `src/lib/currency.ts`, always ending in `Math.round`.
- **Currencies read from `CURRENCIES`.** Don't hardcode a code, symbol, or decimal count anywhere else.
- **Splits preserve `Σ shares === expense.amountMinor`** in every branch. Use the largest-remainder helper in `src/lib/money.ts` for proportional distribution.
- **Settlement preserves `Σ balances === 0`** in base-currency minor units. The assertion in `settle()` is itself a test — keep it loud.
- **`src/lib/` imports no React, no DOM, no `localStorage`, no `Date.now()` without injection.** If you need the time, take `nowMs: number`.
- **Zustand mutations go through actions.** No `set()` outside `store.ts`. Bump the persist version and write a `migrate` in the same commit as any shape change.
- **LLM:** unparseable user input returns `{ parseError }` with an actionable example; infra failures throw.
- **Named exports only** (except `App.tsx`). IDs always come from `lib/id.ts`.
- **No silent fallbacks.** Unexpected state fails loudly with a clear message.
- **No TODOs**, no dead code, no `any` escape hatches without a written reason.

## Done when

- New/changed tests exercise the new behavior and fail without the implementation.
- `npm run lint`, `npm run test`, and `npm run build` all pass locally.
- Test files mirror source under `src/test/` (run `qtest` if unsure).
- Docs that reference the changed code are updated, or explicitly marked as "no update needed".
- A short summary states: what changed, functional impact, and which docs moved with it.

Commit is a separate step — use the `commit` skill, and never commit without the user's explicit instruction.
