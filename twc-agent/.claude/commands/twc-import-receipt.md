---
description: Read a receipt image with vision and add an expense to a group
argument-hint: <groupId> <path/to/image>
---

Read a receipt image and import it as an expense in group
`$1` using image `$2`. Args: $ARGUMENTS

Steps:

1. Parse `$ARGUMENTS` — first token is the group id, second is the image
   path. If either is missing, tell the user the usage and stop.

2. **Read** `data/groups/<groupId>.json`. Error out if missing.

3. **Read** the image file. Use vision to extract:
   - Vendor / description (short, e.g. "Ichiran Ramen").
   - Total amount and currency. If the currency isn't explicit on the
     receipt (Japanese yen symbol, dollar sign, etc.), ask.
   - Date (for sanity only; use `Date.now()` for `createdAt`).

4. **Move the receipt** from its current path into
   `data/receipts/<uuid>.<ext>`. Remember the basename as `receiptRef`.

5. **Confirm the total.** Tell the user "I read the total as ¥1200 JPY —
   confirm? (y/n)". If no, ask for the correct total in minor units. Do
   NOT proceed silently on an ambiguous read.

6. Continue the same flow as `/twc-add-expense`:
   - If currency ≠ group `baseCurrency`, ask for the rate (or use
     `rateHints`).
   - Ask for payer.
   - Ask for split mode and participants.

7. Build the expense object, including `receiptRef: "<uuid>.<ext>"` so
   the frontend can link to it later.

8. **Edit** the group file: append the expense, bump `version`, update
   `rateHints` if a new rate was given.

9. Report the path written and the new version.

**Vision is fallible.** The ¥1200 vs ¥12,000 confusion is the usual
failure mode. Always state the parsed amount out loud and wait for
confirmation.
