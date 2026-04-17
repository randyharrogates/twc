# src/lib/llm/ rules

- `LLMClient` in `types.ts` is the **only** contract between UI and any provider (mock or real).
- Providers return `ExpenseDraft[]` on success or `{ parseError: string }` for unparseable input. **Do not throw** for bad user input — throwing is reserved for genuine infrastructure errors (network, auth).
- A `parseError` message must be actionable: show an example of valid input.
- Adding a new provider: follow the `add-llm-provider` skill. Steps: new `src/lib/llm/<name>Client.ts` implementing `LLMClient`, register in `index.ts` factory, stub-fetch unit test, document supported prompt patterns.
- No secrets ever imported here. Real providers take an API key as a constructor argument; the caller pulls it from user settings (localStorage). Keys never land in git.
