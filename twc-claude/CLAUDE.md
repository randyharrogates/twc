# twc-claude

Local-only, single-user group-expense splitter. State lives in
`data/groups/*.json`. There is no backend. There is no in-browser LLM.

**You (Claude Code) are the write path.** The Vite app is a viewer with
a few light edit forms. The user interacts with you in the terminal to
add expenses, import receipts, and settle up.

## Money invariants (non-negotiable)

1. **Integer minor units within a currency.** `amountMinor` and
   `split[].value` (for `splitMode:"exact"`) are always integers. Never
   write `12.50`; write `1250` for USD, `12` for JPY.
2. **9-currency allow-list**: `SGD MYR USD KRW JPY TWD EUR GBP THB`.
   JPY, KRW, TWD have 0 decimals; the rest have 2.
3. **Largest-remainder method** for proportional splits — implemented in
   `src/lib/money.ts:distributeProportional`. Do not reimplement.
4. **Σ shares === amountMinor** in the expense's own currency, every
   expense.
5. **Σ balances === 0** in base-currency minor units, every group. Do
   not compute this yourself — shell out to `npm run settle -- <id>`.
6. **Schema** lives at `data/.schema/group.json`, generated from the Zod
   schema at `src/lib/schema.ts`. If it's missing, run `npm run schema`.

## Write protocol

- **Always `Read` a group file before `Edit`/`Write`.** The frontend may
  have written to it since your last read.
- **Bump `version: number`** by exactly 1 on every mutation. The
  frontend's `PUT /api/groups/:id` rejects requests where
  `version !== currentVersion + 1`; if you don't bump it, the frontend's
  next edit will be lost.
- **Prefer `Edit` with narrow `old_string`/`new_string`** over full
  `Write` for existing files.
- **Integer minor units.** If the user says "$12.50", convert to `1250`
  and show the conversion in your confirmation.
- **For splits and settlement, shell out**: `npm run settle -- <id>`.
  The script validates, computes, and writes in one atomic step. Do not
  compute balances by hand — you will get them subtly wrong.
- **Pretty-print JSON** (2-space indent, trailing newline) on every write
  so diffs stay readable.

## Interactive Q&A

Terminal questions replace the old TWC's LLM tools (`resolve_name`,
`resolve_payer`, `lookup_fx_rate`). When in doubt:

- **Ambiguous member name** → list candidates (name + id suffix), ask.
- **Missing FX rate** → use `group.rateHints[<code>]` if present;
  otherwise ask the user ("1 USD = ? JPY"). Store the new rate back into
  `rateHints` so the next expense has a default.
- **Unsure of payer** → ask.
- **Vision receipt confirmation** → state the parsed total and currency,
  wait for yes/no. `¥1200` vs `¥12,000` is the common failure.

**Never guess silently** on numeric values.

## Commands (slash-commands defined in `.claude/commands/`)

- `/twc-new-group <name> <baseCurrency> <members…>` — create a group
  file.
- `/twc-add-expense <groupId>` — interactive add.
- `/twc-import-receipt <groupId> <path>` — vision + interactive add.
- `/twc-settle <groupId>` — shell out to `npm run settle`.

Suggest them to the user when relevant.

## Workflow tutorial (same as README)

```
# 1. Start Claude Code in twc-claude/
cd twc-claude && claude

# 2. Create a group
/twc-new-group "Tokyo trip" JPY Alice Bob Carol

# 3. Import a receipt (vision + terminal Q&A)
/twc-import-receipt tokyo-trip ./data/receipts/ramen.jpg

# 4. Add a free-form expense
/twc-add-expense tokyo-trip

# 5. In another terminal, view the result
npm run dev     # http://localhost:5173

# 6. Tweak in the UI (rename, adjust splits) — writes back to the file

# 7. Settle up
/twc-settle tokyo-trip
```

## Layout

```
twc-claude/
├── .claude/              ← skill + slash commands + settings (this dir)
├── data/
│   ├── groups/           ← one file per group (source of truth)
│   ├── receipts/         ← vision inputs
│   └── .schema/          ← generated JSON-Schema
├── src/
│   ├── lib/              ← domain logic (ported from parent TWC)
│   ├── components/       ← viewer + light editor
│   ├── devServer/fsApi.ts← Vite middleware (GET/PUT /api/groups)
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   ├── generate-schema.ts
│   └── settle.ts
└── package.json          ← self-contained; not a workspace of TWC
```

## Things NOT to do

- **Do not add in-browser LLM features.** No `fetch` to Anthropic or
  OpenAI from the frontend. No API keys. If you're tempted, stop — the
  parent TWC at `../` already has that, and this project exists to be
  the one that doesn't.
- **Do not add a backend.** `src/devServer/fsApi.ts` is dev-only Vite
  middleware, not a server. If you need persistence beyond the
  filesystem, you are solving a different problem — ask the user.
- **Do not hardcode currency codes, symbols, or decimals.** Read from
  `src/lib/currency.ts` (`CURRENCIES`, `CurrencyCode`,
  `minorDecimals()`).
- **Do not introduce floats for money outside the FX-conversion boundary**
  in `src/lib/currency.ts:convertMinor`.
- **Do not modify files in the parent TWC repo** (`../src`, `../data`,
  anything at `../*`). This project is meant to be extractable via
  `git subtree split --prefix=twc-claude`.
