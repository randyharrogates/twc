---
description: Compute and record the settlement for a group
argument-hint: <groupId>
---

Compute the settlement for group `$ARGUMENTS`.

Steps:

1. Run the deterministic script:
   ```
   npm run settle -- $ARGUMENTS
   ```
   from the `twc-claude/` directory.

2. Report the script's output verbatim to the user — it prints each
   `from → to: amount` transfer and the new file version.

3. If the script fails:
   - Schema validation error → inspect the listed issues and offer to
     fix them (likely a float `amountMinor` or an unknown currency).
   - `settle: balances must sum to 0` error → this indicates a rounding
     bug upstream; do NOT hand-patch the balances. Read the group file,
     look for expenses where `currency ≠ baseCurrency` and the
     `rateToBase` is suspicious, and ask the user to verify the rate.

4. After a successful run, the group file has `settlement` (array of
   transfers) and `settledAt` (timestamp), and `version` is bumped. The
   frontend reloads automatically if `npm run dev` is running.

**Do not** compute balances or transfers yourself. The script owns the
math; you are the dispatcher.
