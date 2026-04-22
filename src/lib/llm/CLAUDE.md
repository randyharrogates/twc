# src/lib/llm/ rules

- `AgentClient` in `agent.ts` defines the agentic multi-turn contract: `sendTurn`. The
  three real providers (`AnthropicClient`, `OpenAIClient`, `LocalClient`) implement it.
  `OpenAIClient` and `LocalClient` are thin presets around the shared
  `OpenAICompatClient` in `openaiCompatClient.ts` — adding a new OpenAI-shaped
  provider should follow the preset pattern instead of cloning a client.
  - `sendTurn(AgentTurnRequest) → AssistantTurnResult` — emits a turn-level response
    with `blocks` (text + tool_use) and a `stopReason` (`end_turn` | `tool_use` |
    `max_tokens`). The `ChatPanel` runs `runTurn(agent.ts)` on top of this.
- **Agentic loop** (`agent.ts`) mirrors claw-code's `ConversationRuntime::run_turn`
  (`claw-code/rust/crates/runtime/src/conversation.rs:314-515`). It owns the iteration
  cap, the tool dispatch, and the permission-prompter callback (analogue of claw-code
  `permissions.rs:85-88`). The default cap is **32 iterations**, matching claw-code's
  `DEFAULT_AGENT_MAX_ITERATIONS` (`claw-code/rust/crates/tools/src/lib.rs:3475`);
  receipt parsing with many members + FX lookups can legitimately require 20–30 rounds.
- **`onPhase` streaming** (`SendOptions.onPhase`) emits `{kind}` events at boundaries:
  `starting`, `thinking`, `calling_tool:<name>`, `tool_done:<name>`. `runTurn` emits
  the loop-level events; each client also emits `calling_tool` the moment a streamed
  tool-use block reveals its name (OpenAI `tool_calls` / Anthropic `content_block_start`).
  UI uses this to render progress during tool rounds, when `onPartialText` would otherwise
  be silent. Analogue of claw-code's `AssistantEvent` taxonomy
  (`claw-code/rust/crates/runtime/src/conversation.rs:28-40`) — single callback, no
  event bus.
- **Reasoning models**: `isReasoningModel(id)` (intrinsic — GPT-5 family) swaps
  `max_tokens → max_completion_tokens` and emits `reasoning_effort` on OpenAI requests,
  omitting `temperature`/`top_p`. `supportsOptionalThinking(id)` (Claude 4.x) opts in
  via the Anthropic `thinking: { type:'enabled', budget_tokens }` param with budget per
  `thinkingBudgetFor(effort)`. Mirrors
  `claw-code/rust/crates/api/src/providers/openai_compat.rs:774-790,899-923`.
- **Per-group isolation is structural.** `tools/registry.ts` is the coordinator:
  `primaryToolSpecs(group, planMode)` derives the tool-spec list from the active
  `Group` (omitting `add_member` + `submit_drafts` in plan mode), and
  `createAgentExecutor(group, deps)` binds the same `Group` plus the minimum store
  actions (`addMember`, `setRateHint`) and the `RatePrompter` / `PayerPrompter` into
  the dispatcher. Tools only ever see the active group — they cannot address another
  group by id.
- **Mutating tools must go through `PermissionPrompter.decide`.** `runTurn` inspects
  `ToolSpec.mutating` and refuses to execute a mutating tool without an `allow`
  decision. Deny returns a `tool_result` with `isError:true` to the assistant.
- **Interactive tools that prompt the user for a value (e.g. `lookup_fx_rate` via
  `RatePrompter`, `resolve_payer` via `PayerPrompter`) do not route through
  `PermissionPrompter`.** The user typing/picking the value IS consent. Tools that
  mutate store state *silently* (e.g. `add_member`) must go through
  `PermissionPrompter`. `PayerPrompter` returns `{payerId}` where `payerId` is a
  member id or `null` if the user cancels; on `null` the model is instructed to stop
  the tool loop and ask in plain text.
- **Plan mode is enforced behaviorally, not by prompt.** When the `planMode` flag is
  true, `primaryToolSpecs(group, true)` omits `add_member` and `submit_drafts` — the
  model literally cannot emit those tool calls because the definitions aren't sent.
  The system prompt also appends a `PLAN MODE (active)` block so the model doesn't
  waste a turn guessing. Mirrors claw-code's "behavioral enforcement" stance for
  permission gating (`claw-code/rust/crates/runtime/src/permissions.rs:8-28` +
  `claw-code/rust/crates/runtime/src/conversation.rs:400-445`).
- **Truncation handling**: both clients auto-retry with quadrupled `max_tokens` (1024
  → 4096 → 16_384 → model cap) when `stop_reason:'max_tokens'` (Anthropic) or
  `finish_reason:'length'` (OpenAI) is reported; on reaching
  `getModel(id).maxOutputTokens` they throw `TruncationError`, which `ChatPanel`
  surfaces as an actionable toast.
- **Unparseable user input or malformed provider output returns `{ parseError }`.**
  Infrastructure failures — network, 401/403, 429, 5xx after retries — throw `AuthError`,
  `ProviderRateLimitError`, or `NetworkError` from `errors.ts`.
- **Structured output uses Zod + JSON-Schema.** `schema.ts` defines Zod types;
  `tools/submit_drafts.ts` converts them via `toJsonSchema` (wraps `zod-to-json-schema`
  with `target: 'openAi'` and enforces `additionalProperties: false` on every nested
  object). `submit_drafts` is exposed as a regular agent tool — both providers receive
  it alongside the other tools with `tool_choice:'auto'`.
- **Direct `fetch`, no SDK.** Rationale: (a) claw-code itself uses raw HTTP (Rust
  `reqwest`), so ported patterns stay literal; (b) avoids ~180 KB of SDK supply-chain on
  a BYO-key page that reads `localStorage`; (c) each client stays auditable (~330 lines).
- **Anthropic browser CORS requires `anthropic-dangerous-direct-browser-access: true`**
  plus `x-api-key` + `anthropic-version: 2023-06-01`. OpenAI is plain `Authorization: Bearer`.
- **`OpenAICompatClient` is the shared primitive** for any OpenAI-shaped provider.
  It accepts `{ baseUrl, apiKey?, apiModelName?, providerLabel? }`. When `apiKey`
  is blank, the `Authorization` header is omitted entirely (no `Bearer ` prefix on
  an empty value). When `apiModelName` is set, it overrides only `body.model` —
  `req.model` is still used for `getModel(req.model)` lookups (cap, pricing,
  reasoning-kind). `LocalClient` uses this to forward `body.model: '<user tag>'`
  while `req.model: 'local'` resolves the runtime cache.
- **`LocalClient` enforces a URL allow-list at construction.** Allowed:
  `https://*`, `http://localhost`, `http://127.0.0.1`, `http://[::1]` (any port,
  any path). Anything else throws synchronously — this is the load-bearing
  SSRF-adjacent guard, not a UI hint. The same `isAllowedLocalBaseUrl(...)` helper
  is mirrored in `SettingsDialog` for save-time validation.
- **`LocalClient` wraps `fetch` so generic "Failed to fetch" errors become
  `LocalEndpointUnreachableError`** (extends `NetworkError`). Mixed-content blocks,
  Private Network Access preflight failures, refused connections, and DNS errors all
  surface this way; the UI maps them to the README's Run-with-Ollama section.
- **`getModel('local')` is a runtime-cached read, not a static record.** The model's
  `contextWindowTokens`, `maxOutputTokens`, and `supportsVision` come from
  `LOCAL_DEFAULTS` until the user pushes their settings via `setLocalModelRuntime(opts)`.
  `MODELS.local` is exposed via `Object.defineProperty(..., { get })` so it always
  reflects the latest cache. Tests must call `resetLocalModelRuntime()` in
  `afterEach` (or `setLocalModelRuntime(...)` in `beforeEach`) to keep module state
  isolated.
- **Real providers take an API key as a constructor argument.** For Anthropic and
  OpenAI it's required; for `LocalClient` it's optional (most local servers don't
  need one). The caller pulls it from user settings (localStorage). Keys never
  appear in request bodies (only in headers), never in logs, never in exports.
  Each client has a `never includes the API key in the request body` test that
  pins this.
- **Key retrieval is async and routed through the passphrase vault.** The stored value in
  `settings.apiKeys.<provider>` may be plaintext or a `enc.v1.<iv>.<ct>` ciphertext;
  `keyVault.decryptKey(stored)` returns the plaintext or throws `VaultLockedError` from
  `errors.ts` when the value is encrypted but the vault is locked. `ChatPanel` awaits the
  plaintext before constructing the provider client; on `VaultLockedError`, it opens
  `UnlockDialog` and retries the send once.
- **Cost math lives in `cost.ts`.** Prices are integer µUSD per million tokens; exactly
  two `Math.round` calls per turn at the µUSD boundary. No float propagates beyond.
- **Model registry in `models.ts` must be refreshed yearly.** Every entry has a
  `lastVerifiedIso`; `models.test.ts` fails CI if any *remote* entry is >365 days
  old. The `'local'` entry is excluded — it's user-declared, has no upstream
  registry to verify against, and uses a sentinel `'9999-12-31'`.
- **Preflight** runs BEFORE every real-provider send: estimates tokens, rejects over-window
  requests without hitting the provider, rejects images >5 MB after encoding with an
  actionable toast (no silent downscale).
- **`pruneHistory`** in `conversation.ts` drops oldest messages once the soft budget (60%
  of model context window) is exceeded, always preserving the last user→assistant pair,
  and inserts exactly one synthetic "earlier conversation hidden" marker.
- **claw-code is the reference architecture.** When adding a new provider, tool, or
  agentic loop: read claw-code's patterns first, cite the source files in the design, and
  document any TWC-specific adaptations (browser-only, frontend-only).
