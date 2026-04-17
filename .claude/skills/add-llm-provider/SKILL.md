---
name: add-llm-provider
description: Use when wiring a real LLM provider (Anthropic, OpenAI, etc.) behind the LLMClient interface to replace the mock. Walks through file changes, settings UI, secret handling, and the test stub pattern.
---

# Add a real LLM provider

The app ships with `MockLLMClient`. Swapping in a real provider is a drop-in: the UI never changes — only the factory resolves to a different class.

## Checklist

1. **New file: `src/lib/llm/<name>Client.ts`** (e.g. `anthropicClient.ts`). Implement the `LLMClient` interface from `types.ts`. The constructor takes `{ apiKey, model }`.
2. **`src/lib/llm/index.ts`** — extend the factory to return the new client when the user's settings select it. Default remains `MockLLMClient`.
3. **Settings UI** (in the group/global settings panel) — add a provider dropdown and an API-key input. Store the choice and key in the Zustand store under a `settings` slice; the key is persisted to localStorage. **Never commit a key.** Display the key as `password` type, redact in any export.
4. **Prompt contract** — the real provider should accept the group's member list as context and return `ExpenseDraft[]`. Use JSON mode / tool use where the provider supports it; fall back to robust JSON parsing. Malformed output → `{ parseError: "Provider returned unparseable output" }`, not a throw.
5. **`src/test/<name>Client.test.ts`** — unit test using a stubbed `fetch` (or the provider SDK's test utilities). Cover: happy-path returning two drafts, malformed JSON producing a `parseError`, network error throwing an infra error.
6. **Rate-limit / cost guard** — add a minimum 500ms debounce on the assistant input before firing. Add a visible "requests today" counter if the provider has tight free-tier limits.

## Contract reminder

- **Bad input → `{ parseError }`** (user mistake).
- **Infra failure → `throw`** (network, 5xx, bad key). The `LLMAssistant` component shows a generic "couldn't reach provider" toast on throws.

## Verification

- `npm run test` — new and existing tests pass.
- Manual: set the provider in settings, paste a receipt into the assistant, confirm drafts populate with correct members / amounts / currencies.
