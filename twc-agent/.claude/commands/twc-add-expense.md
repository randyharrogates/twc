---
description: Interactively add an expense to a group
argument-hint: <groupId>
---

Interactively add an expense to group `$ARGUMENTS` via terminal Q&A.

Steps:

1. **Read** `data/groups/$ARGUMENTS.json`. If it doesn't exist, tell the
   user and suggest `/twc-new-group`.

2. Ask for:
   - **Description** (free text, e.g. "Ramen at Ichiran").
   - **Amount** and **currency**. Currency must be in the allow-list. If
     the currency differs from the group's `baseCurrency`, also ask for
     the **rate** (e.g. "1 USD = ? JPY"). Default to
     `rateHints[<currency>]` from the group file if present; otherwise
     ask.
   - **Payer**. List the members (name + id suffix) and ask which paid.
     If the user types a name that matches uniquely, use it. If
     ambiguous, list the matches and ask.
   - **Split mode**: `even`, `shares`, `exact`, or `percent`.
   - **Participants / weights** per the split mode:
     - `even`: which members are participating (value 1 for participants,
       0 otherwise).
     - `shares`: ask each participant for a share weight.
     - `exact`: ask each participant for an integer minor-unit amount; Σ
       must equal the total.
     - `percent`: ask each participant for a percentage; Σ must equal 100.

3. **Convert amount to integer minor units.**
   - 2-decimal currencies (SGD, MYR, USD, EUR, GBP, THB): `$12.50` →
     `1250`.
   - 0-decimal currencies (JPY, KRW, TWD): `¥1200` → `1200`.

4. Build the expense object with a fresh id (`e_<8 hex chars>`) and the
   current timestamp in `createdAt`.

5. **Confirm** the whole expense back to the user in a compact summary
   ("Ramen · ¥1200 · even among Alice, Bob · paid by Alice — save?"). On
   yes, proceed; on no, abort or re-ask.

6. **Edit** the group file: append the new expense, bump `version` by 1,
   update `rateHints[<currency>]` if a new rate was given. Pretty-print
   JSON with 2-space indent.

7. Tell the user the file path and the new version number. Suggest the
   frontend reloads automatically if `npm run dev` is running.

**Never** write a float in `amountMinor` or in `exact` split values. If
the user types `12.50`, convert to `1250` and show the conversion in the
confirmation.
