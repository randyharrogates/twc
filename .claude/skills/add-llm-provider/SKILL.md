---
name: add-llm-provider
description: Use when wiring a real LLM provider (Anthropic, OpenAI, etc.) behind the AgentClient interface. Walks through file changes, settings UI, secret handling, and the test stub pattern.
---

# Add a real LLM provider

The app ships with `AnthropicClient` and `OpenAIClient`. Adding another (e.g. Gemini,
Cohere) is a drop-in: provider selection happens inline in `ChatPanel.tsx` — there is
no factory module — so the new class plugs into the same conditional that chooses
between the existing two.

## Checklist

0. **Read the claw-code reference.** Claw-code (`/Users/randychan/git/claw-code`) is
   TWC's LLM / agent framework of record. Before writing any provider code:
   - Read claw-code's `README.md` and `PHILOSOPHY.md`.
   - Scan `rust/crates/api/src/providers/` for the module handling the provider's request
     composition and error classification.
   - Cite the specific files / modules you consulted in the commit message.

1. **New file: `src/lib/llm/<name>Client.ts`** — implement `AgentClient` from
   `agent.ts`. The class must expose:
   - `constructor({ apiKey, maxRetries?, baseDelayMs?, fetchImpl? })`.
   - `sendTurn(req: AgentTurnRequest, opts?: SendOptions) → Promise<AssistantTurnResult>`
     — one multi-modal turn. `AssistantTurnResult` carries `blocks` (text + `tool_use`),
     a `TokenUsage`, a `stopReason` (`end_turn` | `tool_use` | `max_tokens`), and an
     optional `requestId`. The client does NOT run the tool loop itself; `runTurn` in
     `agent.ts` does that on top.

2. **Use direct `fetch`, not an SDK.** Matches claw-code's raw-HTTP pattern and keeps
   the supply-chain surface small.

3. **Bind the fallback `fetch`.** Assign as
   `this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis)` — calling an unbound
   browser `fetch` through an instance property loses its `this === Window` binding and
   throws `Illegal invocation` at runtime. The injected `fetchImpl` path (used by tests)
   is unaffected.

4. **Reuse the existing building blocks:**
   - `buildAgentSystemPrompt(ctx, groupName, tools, planMode)` from `prompt.ts` for
     the system message.
   - `submitDraftsTool(memberIds)` from `tools/submit_drafts.ts` — the tool spec that
     carries the Zod-derived JSON schema (currency codes come from the frozen allow-list
     inside the tool). `executeSubmitDrafts` is what validates the payload via
     `AssistantResponseSchema`; clients do not parse drafts themselves.
   - `blocksToAnthropicContent(blocks)` from `conversation.ts` for the Anthropic wire
     shape. OpenAI content-part conversion is written inline in each OpenAI-shaped
     client (no shared helper — keep it per-client until a second OpenAI-shaped
     provider arrives).
   - `pruneHistory(history, model)` from `conversation.ts` — already called by
     `ChatPanel` before `sendTurn`; do not re-prune inside the client.

5. **Tool coordination lives in `tools/registry.ts`**, not the client. Per-tool files
   under `src/lib/llm/tools/` (`add_member.ts`, `lookup_fx_rate.ts`, `resolve_name.ts`,
   `resolve_payer.ts`, `submit_drafts.ts`) each export their `ToolSpec` + an
   `execute*` function; `createAgentExecutor(group, deps)` wires them into one
   `ToolExecutor`, and `primaryToolSpecs(group, planMode)` returns the per-turn spec
   list. A new provider consumes whatever `AgentTurnRequest.tools` arrives from
   `ChatPanel` — it should not hand-pick tools.

6. **Error taxonomy** — throw `AuthError` on 401/403, `ProviderRateLimitError` on 429
   (with `retryAfterMs` from the `Retry-After` header), `NetworkError` on 5xx after
   retries. Retry 5xx with exponential backoff `baseDelayMs * 2^attempt`.

7. **Model registry** — add entries to `models.ts` with
   `priceInputMicrosPerMillion`, `priceOutputMicrosPerMillion`, `contextWindowTokens`,
   `imageFlatTokens` (Anthropic-style) or 0 (OpenAI-style tile math), `lastVerifiedIso`.
   A CI test fails if any entry is >365 days old.

8. **`src/test/llm/<name>Client.test.ts`** — matrix:
   - Happy path: returns `AssistantTurnResult` with usage and `stopReason: 'end_turn'`.
   - Tool-use path: a turn that ends in `tool_use` returns the right `blocks` shape
     (at least one `{ type: 'tool_use', id, name, input }`).
   - 401 → `AuthError`. 429 → `ProviderRateLimitError`. 5xx → `NetworkError` after retries.
   - JPY receipt cross-currency end-to-end (feed the turn into `runTurn` with a mock
     executor if you want to verify that `amountMinor: 500` round-trips through
     `submit_drafts`).
   - **Key never in body** — assert the literal key string does not appear in any
     stringified request body.

   **Test stub pattern.** Inject `fetchImpl: vi.fn().mockResolvedValue(...)` into the
   constructor. All provider tests drive behavior this way; no network calls escape the
   test process. Example: `new OpenAIClient({ apiKey: 'k', fetchImpl, maxRetries: 0 })`.

9. **Provider selection** lives in `ChatPanel.tsx` (around the `provider === 'anthropic'
   ? new AnthropicClient({...}) : new OpenAIClient({...})` block). Adding a provider
   means extending that conditional and the `Provider` union; there is no factory
   module to update.

10. **Settings UI** — add the provider to `SettingsDialog`'s dropdown when you extend
    the `Provider` union, and add an API-key field slot (the dialog reads `apiKeys[provider]`
    from settings).

11. **Preflight + policy + rate limit are applied by `ChatPanel`**, not by the client.
    Do not duplicate those checks inside the new client.

12. **Consent for images** is handled by `ConsentDialog`, tracked in
    `policy.imageConsentByProvider[provider]`. Add the new provider to that record.

## Reasoning-model checklist (fixed-sampling providers)

If the provider's model family has "reasoning"/"thinking" SKUs (OpenAI GPT-5, o-series,
Anthropic Sonnet/Opus/Haiku 4.x extended thinking, Gemini thinking):

- Mark entries in `models.ts` with `reasoningKind: 'intrinsic' | 'optional' | 'none'`.
  Intrinsic = reasoning is mandatory (GPT-5); optional = opt-in (Claude thinking);
  none = plain completion.
- For intrinsic models, branch the request body: swap `max_tokens` →
  `max_completion_tokens`, emit `reasoning_effort`, and skip temperature/top_p. Cf.
  `claw-code/rust/crates/api/src/providers/openai_compat.rs:774-790,899-923`.
- For optional thinking, gate the thinking/budget param on
  `settings.reasoningEffort !== 'off'`; use `thinkingBudgetFor(effort)` from `models.ts`.
- Pin request-shape tests: reasoning → `{max_completion_tokens, reasoning_effort}`;
  non-reasoning → `{max_tokens}`; `off` on intrinsic → falls back to `minimal`.
- Ignore reasoning/thinking deltas in the stream parser (they are internal; users see
  final text + tool calls only).

## Contract reminder

- **Bad input or malformed provider output → `{ parseError }`** (user mistake).
- **Infra failure → throw typed error** (`AuthError` / `ProviderRateLimitError` /
  `NetworkError`). `ChatPanel` surfaces them as toasts.
- **API keys** — constructor arg only, never logged, never in the request body, never in
  exports. Pinning tests enforce this.
- **Agentic / tool-use extensions** — mirror claw-code. Every tool lives in
  `src/lib/llm/tools/` with its spec + executor co-located; the coordinator is
  `tools/registry.ts`. Follow the tool-pool pattern from
  `rust/crates/tools/src/lib.rs`.

## Verification

- `npm run test` — new and existing tests pass.
- `npm run lint`, `npm run build` green.
- Manual: set the provider + paste a key in Settings → Providers, approve the image
  consent modal, drop a receipt photo into chat, confirm drafts populate correctly.
