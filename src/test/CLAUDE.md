# src/test/ rules

- Vitest only. `*.test.ts` (or `*.test.tsx` if testing components — but strongly prefer testing through `lib/` directly).
- **Tests mirror `src/lib/` one-to-one.** `lib/money.ts` → `test/money.test.ts`.
- Name tests as **behavior**, not function shape: `"distributes remainder cents to earliest participants"`, not `"test distributeRemainder"`.
- **No snapshot tests for logic.** Assert exact values.
- FX-conversion and rounding-distribution tests must cover both 0-decimal currencies (JPY/KRW/TWD) and 2-decimal currencies (USD/EUR/etc) — cross-decimal conversions are the highest bug-density zone.
- Integration-style tests (that assemble whole expenses and verify settlement) go in `test/settlement.test.ts`. Keep them readable — named members, explicit amounts.
