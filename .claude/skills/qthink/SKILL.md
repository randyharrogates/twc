---
name: qthink
description: Use when a task is non-trivial enough to deserve real analysis before any edit — multi-file changes, store-shape changes, new split modes, FX or settlement edits, LLM-contract changes, or any time the user types 'qthink'. Enters plan mode; produces a recommendation grounded in TWC's invariants, with no files written.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

# qthink — deep evaluation before any edit

**Enter plan mode immediately.** This skill never creates or edits files. It ends with a recommendation the user approves (or redirects); implementation happens downstream in `qcode`.

## Step 1 — Orient in TWC's rules

Before analysis, read the rules that apply to the area you're about to touch. Parents are assumed read; only re-read if memory is shaky.

- Root `CLAUDE.md` — money invariant, currency allow-list, commit style, file-size cap.
- Subdirectory `CLAUDE.md` closest to the edit: `src/`, `src/lib/`, `src/lib/llm/`, `src/state/`, `src/components/`, `src/components/ui/`, `src/test/`.
- The three existing skills — `add-split-mode`, `add-llm-provider`, `commit` — are the reference for how TWC phrases a change. Match that voice.

If the task is LLM- or agent-shaped (new provider, tool use, multi-turn, streaming, agentic loop), the framework of record is `/Users/randychan/git/claw-code`. Read its `README.md`, `PHILOSOPHY.md`, and the relevant module under `rust/crates/` or `src/` before designing. Cite specific files. Local re-invention is not acceptable here.

## Step 2 — Clarify first, then evaluate

If the request has any ambiguity, stop and ask — with concrete options and a recommendation so the user can decide in one message. Silence is not consent; "I'll assume X" is not consent. Resolve ambiguities before producing alternatives.

## Step 3 — Evaluate 2–3 alternatives without a pre-picked winner

Include a "minimal change" option when honest. For each approach note: complexity, alignment with existing TWC patterns, maintainability, and bundle/render cost where relevant. State the recommendation **after** the evaluation, not before.

Use web research only when the task hinges on an external library, browser API, or known caveat. Skip it for purely internal work.

## Step 4 — Validate the chosen approach against TWC invariants

Every recommendation must pass these, or explicitly justify why an invariant does not apply:

- **Money** stays in integer minor units; floats only at the FX boundary in `src/lib/currency.ts`, always ending in `Math.round`.
- **Currencies** read from the `CURRENCIES` allow-list in `src/lib/currency.ts`; no hardcoded codes, symbols, or decimals.
- **Splits** — every `computeShares` branch returns `Σ === expense.amountMinor`; proportional splits use the largest-remainder helper in `src/lib/money.ts`.
- **Settlement** — `Σ balances === 0` in base-currency minor units, asserted at the top of `settle()` and thrown loud on violation.
- **Pure-lib boundary** — `src/lib/` imports no React, no DOM, no `localStorage`, no `Date.now()` without injection.
- **Zustand** — one store, `persist` middleware, mutations only through actions; bump the persist version and add a `migrate` in the same commit as any shape change.
- **LLM contract** — unparseable user input returns `{ parseError }`; infra failures throw. Never the other way round.
- **Files** under 40,000 characters; components under ~200 lines.

## Step 5 — Concurrency / render-cycle check

React 19 + Zustand + localStorage has its own failure modes. Flag them when the change touches state, effects, or persistence:

- Selectors that return fresh arrays/objects each call → render storms; use `useShallow` or equivalent.
- `set()` called outside store actions → breaks the single mutation path.
- State shape changed without bumping the persist version → silent localStorage corruption.
- Effects that write to the store without guards → infinite render loops.

If none apply, say so explicitly. Do not invent concurrency where there is none.

## Step 6 — Documentation impact

List every doc the change will touch: root `CLAUDE.md`, the relevant subdirectory `CLAUDE.md`, `README.md`, and any skill whose checklist is now stale (`add-split-mode`, `add-llm-provider`, `commit`). If no doc needs updating, say why — don't leave the section blank. `qcode` treats doc updates as part of the deliverable, not follow-up.

## Output shape

Adapt depth to the task; skip sections that truly don't apply.

1. Context and requirements
2. Alternatives considered (neutral trade-offs)
3. Recommendation, stated after the evaluation
4. Invariant check (money / currency / splits / settlement / pure-lib / Zustand / LLM contract)
5. Render-cycle or persistence concurrency notes, or "N/A — no state or effect touched"
6. Documentation impact
7. Open questions — if any, stop here; do not advance to a recommendation until answered
8. Next step: `qcode` (with the implementation outline the user approved)
