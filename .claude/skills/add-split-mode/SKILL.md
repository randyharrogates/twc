---
name: add-split-mode
description: Use when introducing a new split mode (e.g. "add a rounding-down mode", "add per-item weighted split"). Walks through every file that must change so no validation or UI path is missed.
---

# Add a new split mode

A split mode is how an expense's total is divided among selected participants. Existing modes: `even | shares | exact | percent` (`src/types.ts`). Adding a mode means updating **every** site below — skipping any one of them silently breaks invariants or the UI.

## Checklist

1. **`src/types.ts`** — extend the `SplitMode` union (and `SplitEntry.value` semantics if needed).
2. **`src/lib/splits.ts`** — add a branch in `computeShares()` that returns `Map<memberId, amountMinor>` for the new mode. **Must satisfy `Σ returned === expense.amountMinor`.** Use the largest-remainder helper from `lib/money.ts` for any proportional distribution.
3. **`src/lib/validation.ts`** — add a validator that returns a user-facing error string (or `null` if valid). For fixed-sum modes (exact/percent), enforce the sum invariant here so the dialog can refuse to save.
4. **`src/components/SplitEditor.tsx`** — add a branch that renders the right inputs per member (checkbox / number input / currency input) and shows live validation feedback.
5. **`src/test/splits.test.ts`** — add tests: a normal case, a rounding-remainder edge case, a payer-not-in-split case. Assert exact values.
6. **`src/test/settlement.test.ts`** — add at least one assembled-expense test that exercises the new mode through to a final settlement.

## Verification

- `npm run test` — all existing + new tests pass.
- Manual: open the dev server, create a group, add an expense in the new mode, confirm settlement math matches hand-calculated values.
