---
name: twc-assistant
description: Read, mutate, and write group-expense JSON files under data/groups/. Use when the user asks to add expenses, import a receipt, rename members, or settle up. Enforces integer-minor-unit money, the 9-currency allow-list, and optimistic-concurrency versioning.
---

# twc-assistant

TWC-Claude stores one group per JSON file under `data/groups/<groupId>.json`.
This skill teaches Claude Code how to read, mutate, and write those files
safely.

## Invariants (non-negotiable)

1. **Integer minor units.** `amountMinor` and `split[].value` (for
   `splitMode:"exact"`) are always integers. Never write `12.50` — write
   `1250` for USD or `12` for JPY. Decimals belong in the UI only.
2. **9-currency allow-list.** `SGD MYR USD KRW JPY TWD EUR GBP THB`. JPY,
   KRW, TWD are 0-decimal (¥500 → `amountMinor: 500`). The other six are
   2-decimal (S$12.50 → `amountMinor: 1250`).
3. **Σ shares === amountMinor** in the expense's own currency.
4. **Σ balances === 0** in base-currency minor units. Do not compute this
   yourself — run `npm run settle -- <groupId>`.
5. **Version bump on every write.** The group file has a top-level
   `version: number`. Increment it by exactly 1 before saving.
6. **Schema.** `data/.schema/group.json` is generated from the Zod schema at
   `src/lib/schema.ts`. If the schema file is missing, run `npm run schema`
   first.

## Write protocol

- **Read before write.** Always `Read` `data/groups/<id>.json` before
  editing it; the file may have been updated by the frontend.
- **Prefer `Edit` over `Write`** for small changes (adding one expense,
  renaming a member). Use `Write` only to create a new group file.
- **Bump `version`.** Increment by 1 on every mutation.
- **Never hand-compute settlements.** Shell out:
  `npm run settle -- <groupId>`. The script validates, computes, and
  writes in one atomic step.
- **Validate.** If you have any doubt the output is valid, `Read` the
  schema at `data/.schema/group.json` and cross-check before writing.

## Interactive Q&A

The old TWC exposed tools for `resolve_name`, `resolve_payer`,
`lookup_fx_rate`. In Claude Code those collapse into plain terminal
questions:

- **Ambiguous member name** → list candidates, ask which one.
- **Missing FX rate** → ask the user (`"rate from USD to JPY?"`). Store in
  `rateHints[<currency>]` so next time you have a default.
- **Unsure of payer** → ask.
- **Receipt total confirmation** → after running vision, state the total
  you read and the currency, ask for yes/no before writing.

**Never guess silently.** A wrong `amountMinor` corrupts the group's
settlement.

## Group file shape

Minimal valid example (full schema: `data/.schema/group.json`):

```json
{
  "id": "tokyo-trip",
  "version": 1,
  "name": "Tokyo trip",
  "baseCurrency": "JPY",
  "createdAt": 1745280000000,
  "members": [
    { "id": "m_alice", "name": "Alice" },
    { "id": "m_bob",   "name": "Bob" }
  ],
  "expenses": [
    {
      "id": "e_ramen",
      "description": "Ramen",
      "amountMinor": 1200,
      "currency": "JPY",
      "rateToBase": 1,
      "payerId": "m_alice",
      "splitMode": "even",
      "split": [
        { "memberId": "m_alice", "value": 1 },
        { "memberId": "m_bob",   "value": 1 }
      ],
      "createdAt": 1745280100000
    }
  ],
  "rateHints": {}
}
```

## Split modes

- `even`: `split[].value` is 1 for participants, 0 for non-participants.
- `shares`: `split[].value` is a weight (2:1 means Alice gets 2× Bob's share).
- `exact`: `split[].value` is an integer in minor units; Σ must equal
  `amountMinor`.
- `percent`: `split[].value` in 0..100; Σ must equal 100.

## Commands cheat-sheet

- `/twc-new-group <name> <baseCurrency> <members…>`
- `/twc-add-expense <groupId>`
- `/twc-import-receipt <groupId> <path>`
- `/twc-settle <groupId>`
