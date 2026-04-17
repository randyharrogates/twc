# twc

Frontend-only Splitwise-style expense splitter. Groups of people log who paid for what, assign per-item participants and a split rule, and see a minimal "who owes whom" settlement. A mock LLM assistant parses natural-language prompts into draft expenses; the real LLM slots in later via the `LLMClient` interface.

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
- [`src/test/CLAUDE.md`](src/test/CLAUDE.md)

## Skills

Three repo-local skills live in `.claude/skills/`:

- `add-split-mode` — checklist for introducing a new `SplitMode`
- `add-llm-provider` — checklist for wiring a real LLM provider behind the `LLMClient` interface
- `commit` — Conventional-Commits helper (never commits without explicit user instruction)
