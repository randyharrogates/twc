# twc

A frontend-only Splitwise-style expense splitter. Log who paid for what in a shared group, pick how each expense is split, and see a minimized "who owes whom" settlement. Supports nine currencies (SGD, MYR, USD, KRW, JPY, TWD, EUR, GBP, THB) with user-entered FX rates.

Includes a mock LLM assistant that parses simple natural-language prompts into draft expenses. A real provider slots in behind the `LLMClient` interface without touching the UI.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Zustand · Vitest.

## Run

```sh
npm install
npm run dev     # http://localhost:5173
npm run test    # vitest
npm run build   # production bundle
```

## Design rules

See `CLAUDE.md` for the project-wide rules (money invariant, currency allow-list, commit style). Each subdirectory has its own `CLAUDE.md` with local rules.
