# twc

Frontend-only Splitwise-style expense splitter. Groups of people log who paid for what,
assign per-item participants and a split rule, and see a minimal "who owes whom"
settlement. A multimodal chat assistant (Anthropic + OpenAI, pluggable via the
`AgentClient` interface) parses receipt photos and free-form notes into draft expenses that
flow through the existing `addExpense` pipeline.

Deployment target: **GitHub Pages** (static). Real providers ship as **BYO-key**
(user's own Anthropic / OpenAI API key, stored in their browser's `localStorage`). No
backend required; a Cloudflare Worker proxy is the documented escape hatch if a
shared-key mode is ever needed.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Zustand (with `persist` middleware → `localStorage`)
- Vitest (`src/test/**`)

No backend, no auth, no network calls, no API keys in code.

## Money invariant — critical

Within a single currency, all amounts are stored as **integer minor units** (cents/yen/won). Floats are allowed only at:

1. The FX-conversion boundary in `src/lib/currency.ts`, which always ends in `Math.round` back to integer minor units.
2. The rate itself (`number` typed; user-entered).

Never do floating-point arithmetic on money anywhere else. Every proportional split must preserve `Σ shares === expense.amountMinor` via the largest-remainder method. Every settlement must satisfy `Σ balances === 0` (in base-currency minor units) — assert it and fail loudly on violation.

## Currencies

Supported set is the frozen 9-code allow-list in `src/lib/currency.ts`: `SGD, MYR, USD, KRW, JPY, TWD, EUR, GBP, THB`. The `CurrencyCode` union type enforces the allow-list at compile time. Do not hardcode currency codes, symbols, or decimals anywhere else — always read from `CURRENCIES`.

## Commands

```
npm run dev         # vite dev server (http://localhost:5173)
npm run build       # tsc -b && vite build
npm run test        # vitest run
npm run test:watch  # vitest (watch mode)
npm run lint        # eslint .
```

## Git & docs

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`). No Claude/Anthropic attribution.
- Keep every file under 40,000 characters; split when it grows.
- No committed API keys, ever.

## Directory rules

Each subdirectory has its own `CLAUDE.md` with local rules. Read the one closest to the file you're editing; parents are assumed read.

- [`src/CLAUDE.md`](src/CLAUDE.md)
- [`src/lib/CLAUDE.md`](src/lib/CLAUDE.md)
- [`src/lib/llm/CLAUDE.md`](src/lib/llm/CLAUDE.md)
- [`src/state/CLAUDE.md`](src/state/CLAUDE.md)
- [`src/components/CLAUDE.md`](src/components/CLAUDE.md)
- [`src/components/ui/CLAUDE.md`](src/components/ui/CLAUDE.md)
- [`src/components/chat/CLAUDE.md`](src/components/chat/CLAUDE.md)
- [`src/test/CLAUDE.md`](src/test/CLAUDE.md)

## Skills

Repo-local skills in `.claude/skills/`:

- `qthink`              — ultra-deep plan-mode evaluation; absorbs the "read project docs" and "validate plan" steps
- `qcode`               — TDD implementation with lint/test/build gates
- `qcheck`              — skeptical senior-engineer review (folds function- and test-level checks)
- `qtest`               — validate test placement mirrors `src/**` under `src/test/`
- `review-function`     — Writing-Functions checklist applied to a function
- `review-test`         — Writing-Tests checklist applied to a test
- `add-split-mode`      — checklist for introducing a new `SplitMode`
- `add-llm-provider`    — checklist for wiring a real LLM provider behind `AgentClient`
- `commit`              — Conventional Commits helper (never commits without explicit instruction)

## Commands

Repo-local commands in `.claude/commands/`:

- `/qpullrequest <base-branch> [TRU-####]` — generate a PR body from `base-branch..HEAD`, saves to `pr_message.md`
- `/qchangelog [base-branch]` — generate a CHANGELOG entry from the branch diff, prepended to `CHANGELOG.md`

## Agents

Repo-local agents in `.claude/agents/`:

- `code-quality-reviewer` — skeptical senior-architect review of recent changes against TWC invariants

## Reference repositories — LLM / agent framework

**`/Users/randychan/git/claw-code` is TWC's LLM / agent framework of record.**

Any work that touches the `AgentClient` interface, adds a real provider, introduces
tool use, multi-turn conversation, streaming, or any agentic loop MUST:

1. Read claw-code's `README.md`, `PHILOSOPHY.md`, and the relevant module under
   `rust/crates/` or `src/` BEFORE designing the change.
2. Cite the specific claw-code files / sections that informed the design in the
   plan, commit message, and any design note.
3. Prefer claw-code patterns over local re-invention. If a pattern from claw-code
   clearly does not fit TWC's browser-only, frontend-only constraints, state that
   explicitly in the design note with the reason.

TWC's `AgentClient` interface (`src/lib/llm/agent.ts`) exposes a single turn-level
method: `sendTurn(AgentTurnRequest) → Promise<AssistantTurnResult>`. A turn yields
`blocks` (text + tool_use) and a `stopReason` (`end_turn` | `tool_use` | `max_tokens`);
the agentic loop `runTurn(RunTurnOpts)` in the same file iterates `sendTurn` calls,
dispatches tool executions, and emits `onPhase` events until `end_turn`. Anthropic and
OpenAI clients are wired via direct `fetch` calls (no SDK — matches claw-code's
`reqwest` usage and keeps the supply-chain surface small). Zod + `zod-to-json-schema`
generates strict JSON-Schema for both Anthropic `tool_use` and OpenAI
`response_format.json_schema.strict`.
