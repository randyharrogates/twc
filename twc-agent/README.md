# twc-agent

A local-only, single-user fork of [TWC](../) (the group-expense
splitter), living permanently inside the TWC repo as a sibling to
`src/`. Instead of an in-browser chat, **Claude Code is the input
surface**, driven from inside this folder. The Vite app is the viewer.

## How it's used (important)

**Run Claude Code from inside `twc-agent/`, not from the TWC repo
root:**

```
cd twc-agent
claude
```

Why: Claude Code treats the current working directory as its project
root. Starting it here sandboxes it to `twc-agent/` — it can read, edit,
and write JSON files under `data/groups/`, but it can't touch anything
else in the parent TWC (`../src`, `../vite.config.ts`, the deployed app,
etc.). The sandbox is cwd-based, not permission-based, so don't `cd ..`
mid-session.

Side-effect: the slash commands (`/twc-new-group`, `/twc-add-expense`,
`/twc-import-receipt`, `/twc-settle`) are only available from this cwd —
they live at `twc-agent/.claude/commands/`.

## What this is

- **You add expenses in Claude Code**, not in the browser. Claude uses
  its native `Read` / `Edit` / `Write` / vision tools to mutate the JSON
  files, and asks you questions in the terminal (payer, FX rate, split
  mode) instead of through a web UI.
- **The Vite app is a read-only-ish viewer** with a few light edit forms
  (rename a member, tweak a split). It reads `data/groups/*.json` via a
  tiny dev-server middleware and renders balances + a settlement.
- **No API keys anywhere.** Claude Code uses your Pro / Max
  subscription. The heavy BYO-key chat loop from the parent TWC is
  intentionally absent.

## Prerequisites

- Node 20+ and git.
- A [Claude Pro or Max](https://claude.ai/upgrade) subscription.
- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
  installed. On first run, `claude /login` once and pick "Claude
  subscription."

## Install

```
cd twc-agent
npm install
npm run schema          # generates data/.schema/group.json
```

This project is self-contained: its own `package.json`, `node_modules`,
`.claude/` skill and commands; no imports across the `twc-agent/`
boundary into the parent TWC.

## The workflow

The end-to-end flow from empty to a rendered, settled group:

```
# 1. Start Claude Code in the twc-agent subfolder
cd twc-agent && claude

# 2. Create a group (in the Claude Code prompt)
/twc-new-group "Tokyo trip" JPY Alice Bob Carol
# → writes data/groups/tokyo-trip.json

# 3. Drop a receipt image into data/receipts/, then in Claude Code:
/twc-import-receipt tokyo-trip ./data/receipts/ramen.jpg
# Claude uses vision, reads the JPY total, asks you who paid and
# how to split it. Answer in the terminal.

# 4. Add a free-form expense (no receipt):
/twc-add-expense tokyo-trip
# Claude asks for description, amount, currency, payer, split mode.

# 5. View the result in the browser (keep Claude Code running — fine
#    to have both open in separate terminals):
npm run dev
# open http://localhost:5173

# 6. Tweak anything in the web UI (rename a member, etc).
#    Changes write back to data/groups/tokyo-trip.json via
#    PUT /api/groups/tokyo-trip (dev-only middleware).

# 7. Settle up:
/twc-settle tokyo-trip
# Appends settlement + settledAt to the group file; the UI reloads.
```

## Where state lives

- `data/groups/<groupId>.json` — one file per group. Tracked or
  `.gitignored`, your call (see `.gitignore`).
- `data/receipts/<uuid>.<ext>` — receipt originals, referenced by
  `expense.receiptRef`.
- `data/.schema/group.json` — generated JSON-Schema. Regenerate with
  `npm run schema` after any change to `src/lib/schema.ts`.

## Money invariants

Ported from the parent TWC, non-negotiable:

- **Integer minor units** inside a single currency (JPY ¥1200 →
  `amountMinor: 1200`; USD $12.50 → `amountMinor: 1250`). Floats only
  cross `src/lib/currency.ts` at the FX-conversion boundary, always
  ending in `Math.round`.
- **9-currency allow-list**: `SGD MYR USD KRW JPY TWD EUR GBP THB`.
- **Σ shares === amountMinor** in the expense's own currency.
- **Σ balances === 0** in base-currency minor units. The frontend fails
  loudly on violation.

## Troubleshooting

- *Claude wrote a float for `amountMinor`* — the frontend will show a
  red banner with the validation error. Re-run the command in Claude
  Code and say "use integer minor units" — or hand-edit the JSON.
- *Frontend won't save my edit* — optimistic-concurrency conflict.
  Reload the page to pick up Claude Code's most recent write, then
  re-apply your edit.
- *Claude misread a receipt* — answer "no" at the confirmation prompt
  and give it the correct total.
- *`npm run settle` throws "balances must sum to 0"* — that means a
  rounding bug upstream, usually a wrong `rateToBase`. Ask Claude to
  re-inspect the suspect expense; do not hand-patch balances.
- *Claude tried to touch files in the parent TWC* — you started Claude
  Code from the wrong directory. Exit, `cd twc-agent`, and run `claude`
  again.

## Commands

```
npm run dev         # Vite dev server on http://localhost:5173
npm run schema      # Regenerate data/.schema/group.json from Zod
npm run settle -- <id>   # Compute + record settlement for a group
npm run test        # Vitest run
npm run build       # tsc + vite build
npm run lint        # ESLint
```

## What this is NOT

- Not a web app to share with non-technical friends.
- Not a hosted service — everything is your filesystem.
- Not a replacement for the parent TWC at [../](../), which is the
  deployed, BYO-key, in-browser chat version.
