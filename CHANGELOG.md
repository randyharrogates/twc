# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-04-24

### Added

- **(settlement)** Editable transfers on step three. The greedy `settle()` plan
  is now an override-able default: users can add, delete, reroute, or manually
  adjust any transfer via the new
  [`TransfersEditor.tsx`](src/components/TransfersEditor.tsx) component. A
  live red imbalance banner lists per-member residuals (e.g. `Alice:
  +S$10.00 imbalanced`) while the edit is in-flight, and a yellow staleness
  banner appears if expenses change after manual edits. "Reset to auto" drops
  the override and re-renders the computed plan.
- **(settlement)** Shareable plain-text summary card
  ([`SettlementSummaryCard.tsx`](src/components/SettlementSummaryCard.tsx))
  — full-width card below the Balances / Transfers columns with a Copy-to-
  clipboard button. The rendered block includes the group name, base
  currency, ISO-dated expense list with payer + native-currency amount,
  balances, and transfers. Format is plain text so it pastes cleanly into
  WhatsApp, Telegram, Slack, Discord, or SMS.
- **(ui)** `Drawer` primitive in [`ui/Drawer.tsx`](src/components/ui/Drawer.tsx) —
  native-`<dialog>` + `showModal()` pinned to the right or left edge. Width is
  `clamp(320px, 38.2vw, 720px)` (golden-ratio minor portion, full-width on
  narrow viewports) with slide-in keyframes in
  [`src/index.css`](src/index.css). Zero domain knowledge; reusable for future
  drawer-shaped surfaces.
- **(ui)** `HelpDrawer.tsx` — in-app usage guide (Quickstart, Groups, Expenses,
  Settlement, Chat Assistant, Security & Vault, Currencies & FX) rendered with
  a φ-based type scale (42 / 26 / 16 px). Opens from a `?` icon in `Nav` (left
  of the gear) and from a bare `?` keypress (suppressed while typing into an
  input, textarea, select, or contentEditable element).
- **(lib)** Pure `formatSettlementSummary(group, balances, transfers)` in
  [`src/lib/summary.ts`](src/lib/summary.ts). Deterministic, uses
  `formatMinor` and `expense.createdAt` — no DOM, no `Date.now()`.
- **(lib)** Pure settlement helpers `transferImbalance(balances, transfers)`
  and `isBalanced(imbalance)` in
  [`src/lib/settlement.ts`](src/lib/settlement.ts) — used by
  `TransfersEditor` to decide between the balanced / imbalanced / stale
  render paths. `settle()` and `computeBalances()` are unchanged; the new
  helpers validate user edits, they don't replace the greedy planner.
- **(state)** `Group.customTransfers?: Transfer[]` optional override on
  [`src/types.ts`](src/types.ts) and `setCustomTransfers` /
  `clearCustomTransfers` actions on
  [`src/state/store.ts`](src/state/store.ts). `undefined` means "use the
  auto-computed plan"; the render path falls back automatically.

### Changed

- **(state)** Persist version bump v8→v9. Migration is additive — existing
  groups come through with `customTransfers` undefined, which is the
  intended default, so no per-group rewrite runs and no user data is
  touched. Storage key stays `twc-v1`.
- **(settlement)** `SettlementSection.tsx` split into `BalancesCard`,
  `TransfersEditor`, and `SettlementSummaryCard`. Layout changed from a
  two-column grid to two columns + a full-width summary row
  (`md:col-span-2`) so the copy-paste block has breathing room on wider
  viewports.
- **(ui)** `Nav.tsx` gains an `onOpenHelp` callback and a `?` icon rendered
  to the left of the gear; `Shell.tsx` owns the drawer state and registers
  the `?` keyboard shortcut alongside the existing ⌘/Ctrl+K and ⌘/Ctrl+,
  bindings.
- **(docs)** CLAUDE.md updates in `src/components/`, `src/components/ui/`,
  and `src/state/` describing the new settlement surface, the Drawer
  primitive, and the v9 persist shape.

## [0.3.0] - 2026-04-22

### Added

- **(llm)** `'local'` provider — point TWC at any OpenAI-compatible
  `/v1/chat/completions` endpoint you run yourself (Ollama, LM Studio, vLLM,
  llama.cpp server). Receipts, chats, and tool calls stay on the user's
  machine; no third-party billing relationship. New
  [`src/lib/llm/localClient.ts`](src/lib/llm/localClient.ts) wraps the shared
  primitive, validates the user-supplied Base URL against an HTTPS-or-loopback
  allow-list at construction (load-bearing — not just a UI hint), and maps
  generic browser "Failed to fetch" errors to a named
  `LocalEndpointUnreachableError` that the chat surface translates into the
  README's mixed-content / PNA / CORS troubleshooting.
- **(llm)** `OpenAICompatClient` extracted from the existing `OpenAIClient`
  ([`src/lib/llm/openaiCompatClient.ts`](src/lib/llm/openaiCompatClient.ts)).
  Accepts `{ baseUrl, apiKey?, apiModelName?, providerLabel? }`; the
  `apiModelName` override forwards the user-supplied wire tag (e.g.
  `qwen2.5-vl:7b`) in `body.model` while `req.model` keeps driving
  `getModel()` lookups for cap, pricing, and reasoning kind. When `apiKey` is
  blank the `Authorization` header is omitted entirely (no `Bearer ` on an
  empty value).
- **(llm)** `LocalEndpointUnreachableError extends NetworkError` in
  `errors.ts` — a named subtype so existing infra-error handlers still treat
  it as a network failure, while the chat panel can recognise the
  mixed-content / PNA / refused-connection family and link to the
  Run-with-Ollama section of the README instead of a generic toast.
- **(llm)** `'local'` model entry in `models.ts` with a runtime cache
  (`setLocalModelRuntime` / `resetLocalModelRuntime`) — `MODELS.local` is
  exposed via `Object.defineProperty(..., { get })` so `contextWindowTokens`,
  `maxOutputTokens`, and `supportsVision` always reflect the user's settings.
  Zero µUSD prices; `reasoningKind: 'none'`; sentinel
  `lastVerifiedIso: '9999-12-31'` is excluded from the year-staleness CI test.
- **(state)** `settings.localModel` shape (Base URL, model name, context
  window, max output tokens, vision flag) plus `setLocalModel` action with
  defensive URL allow-list re-check. `apiKeys.local` is optional and bypasses
  the vault encrypt/unlock pipeline when blank — there is nothing to protect
  unless the user voluntarily configures a key.
- **(state)** Persist version bump v7→v8; additive `withV8` migration sets
  `settings.localModel = defaultLocalModel()` and
  `policy.imageConsentByProvider.local = false` for existing users with no
  data loss.
- **(ui)** Settings → Providers → **Local** section
  ([`SettingsDialog.tsx`](src/components/SettingsDialog.tsx)) — collapsible
  panel with Base URL (inline allow-list validation showing exact rejection
  reason), model name, context window, max output, vision toggle, optional
  API key field, save button, and an inline expanded-by-default Security
  notes panel summarising the five risks. The Active-provider dropdown gains
  a `Local (Ollama / LM Studio / llama.cpp)` option; image consent in the
  Policy tab gains a Local row with bespoke "your configured server" copy.
- **(chat)** Three-way client construction in
  [`ChatPanel.tsx`](src/components/chat/ChatPanel.tsx) —
  `AnthropicClient` / `OpenAIClient` / `LocalClient`. A `useEffect` mirrors
  `settings.localModel` capacity into the library-side runtime cache via
  `setLocalModelRuntime(...)` so `getModel('local')` resolves the user's
  values without a render loop. The error formatter now maps
  `LocalEndpointUnreachableError` to a README-pointing toast; the
  key-missing banner reads "Local provider not configured" with a link
  straight to Settings.
- **(chat)** `ChatToolbar` model picker grows a third **Local** section,
  takes a new `localConfigured` prop so the per-row "missing" badge can read
  "no API key" or "not configured" appropriately. `ConsentDialog` extended
  with a `local` consent screen that names the user's configured Base URL
  rather than a third party. `slashCommands.ts` gains a `localConfigured`
  dep and routes `/model local` correctly.
- **(chat)** Cost chip in `TokenCostBar` swaps to `$0.00 (local)` when the
  active provider is `'local'` so the rolling-dollar UI doesn't imply a
  charge that never happens.
- **(test)** New
  [`src/test/llm/openaiCompatClient.test.ts`](src/test/llm/openaiCompatClient.test.ts)
  ports the OpenAI client tests verbatim to the extracted primitive and adds
  pinned coverage for the `apiModelName` override and the blank-key
  no-`Authorization` invariant. New
  [`src/test/llm/localClient.test.ts`](src/test/llm/localClient.test.ts)
  pins the URL allow-list (HTTPS, `localhost`, `127.0.0.1`, `[::1]`
  accepted; `http://evil.com`, `http://192.168.1.1`, `file://`, `ftp://`,
  `javascript:` rejected), Authorization-header-omitted-when-blank,
  key-never-in-body, the `LocalEndpointUnreachableError` mapping for
  "Failed to fetch", AbortError pass-through, and a JPY 0-decimal
  round-trip via the runtime cache.

### Changed

- **(llm)** `OpenAIClient` shrunk to a thin preset around
  `OpenAICompatClient` — required `apiKey`, fixed
  `https://api.openai.com/v1/chat/completions` base URL,
  `providerLabel: 'openai'`. All transport, error mapping, streaming, and
  reasoning-model behaviour now lives in the shared primitive. The public
  constructor surface and behaviour are unchanged.
- **(llm)** `Provider` widened from `'anthropic' | 'openai'` to
  `'anthropic' | 'openai' | 'local'`. `imageConsentByProvider` gains a
  `local: boolean` slot; `Settings.llmProvider` and `apiKeys` widen
  accordingly. Cascade tracked through `ChatPanel`, `ChatToolbar`,
  `SettingsDialog`, `ConsentDialog`, `slashCommands`, store types, and
  policy types.
- **(llm)** `Model.supportsVision` typed as `boolean` instead of literal
  `true` so the local entry can declare itself text-only by default.
- **(ui)** `APIKeyHelpPanel` typed as `RemoteProvider = Exclude<Provider,
  'local'>`; local users configure their own server and don't need a
  third-party "create a key" walkthrough.
- **(docs)** New top-level **Run with Ollama (local model)** section in the
  README between Architecture and Quick start: rationale, Ollama install
  (with the `≥ 0.5` PNA-preflight requirement called out), three
  recommended vision models with `ollama pull` commands, exact
  `OLLAMA_ORIGINS` blocks for the `npm run dev` and published-URL cases
  with a bold warning against `OLLAMA_ORIGINS=*`, step-by-step TWC config
  walkthrough, browser-compatibility table (Chrome / Firefox / Safari ×
  github.io / localhost), troubleshooting table, and a six-item Security
  section that pairs each risk with a concrete user action.
- **(docs)** README LLM-providers table gains a Local row; mermaid
  architecture diagram adds the `LocalClient` branch; ToC entry added.
- **(docs)** Root `CLAUDE.md` provider one-liner widened, BYO-server line
  added, Stack note for local models, `OpenAICompatClient` primitive
  call-out, vault-paragraph addendum for `apiKeys.local`. Subdirectory
  rulebooks updated: `src/lib/llm/CLAUDE.md` documents the
  `OpenAICompatClient` primitive, `LocalClient` URL allow-list as
  load-bearing, the `LocalEndpointUnreachableError` mixed-content signal,
  and `getModel('local')` runtime-cache semantics; `src/state/CLAUDE.md`
  bumps the persist-version line to 8 and documents the `localModel` shape
  and the optional `apiKeys.local` vault-skip; `src/components/CLAUDE.md`
  adds a "three-way provider branching — don't two-way this anymore"
  section.
- **(docs)** `add-llm-provider` skill gains an OpenAI-compat preset
  section telling future contributors to wrap `OpenAICompatClient` instead
  of hand-rolling a new client when the provider speaks
  OpenAI-compatible chat-completions.

## [0.2.0] - 2026-04-20

### Added

- **(security)** Session-scoped passphrase vault for API keys (`src/lib/crypto.ts`, `src/lib/keyVault.ts`). PBKDF2-SHA256 600 000 iterations, AES-GCM-256, 12-byte random IV per value, 16-byte random salt; ciphertext encoded as a tagged `enc.v1.<iv>.<ct>` string stored in place of the plaintext inside `settings.apiKeys.<provider>`. Passphrase never persisted — only salt, iteration count, and an encrypted probe live in `settings.vault`. Pattern uses the same PBKDF2-SHA256 + AES-GCM parameters as a prior project.
- **(security)** `SecurityPanel` component in `Settings → Providers` exposes setup / unlock / lock / wipe, with status badge (Unlocked / Locked / Not configured) and always-visible help block explaining the shared-origin risk on `randyharrogates.github.io` and what the vault protects against.
- **(security)** `UnlockDialog` fires when a chat send hits a `VaultLockedError` (new error in `src/lib/llm/errors.ts`); successful unlock retries the original send once.
- **(security)** `KeyReminderBanner` at the top of the shell is state-aware: prompts to set up a passphrase when a plaintext key is stored; offers Lock-now when the vault is unlocked; hidden when the vault is locked or no key is stored. Session-scoped dismissal via `sessionStorage['twc-key-reminder-dismissed']`.
- **(state)** Store actions `setupVault`, `unlockVault`, `lockVault`, `wipeVault` plus reactive `vaultUnlocked` flag (non-persisted). `setApiKey` is now async and encrypts at save time when the vault is unlocked. `wipeVault` clears both the vault meta and all stored API keys.
- **(state)** Persist version bump v6→v7; additive migration defaults `settings.vault = null`.
- **(docs)** Top-level "Security & trust" section in `README.md` explaining the threat model, shared-origin risk, and the passphrase vault in enough depth for a non-cryptographer to decide whether to trust the site.
- **(social)** Open Graph + Twitter Card meta tags in `index.html` + placeholder `public/og-image.png` (1200×630) for LinkedIn previews.
- **(ci)** `.github/workflows/deploy.yml` now runs `npm run lint` and `npm run test` before `npm run build`; a failing lint or test blocks auto-deploy to GitHub Pages.

## [0.1.0] - 2026-04-19

### Added

- **(llm)** `AgentClient` interface (`src/lib/llm/agent.ts`) with single multimodal turn method `sendTurn(AgentTurnRequest) → AssistantTurnResult` and top-level `runTurn(RunTurnOpts)` agentic loop — 32-iteration default cap, tool dispatch, permission-prompter callback. Mirrors claw-code's `ConversationRuntime::run_turn`.
- **(llm)** Anthropic and OpenAI clients (`anthropicClient.ts`, `openaiClient.ts`) wired via direct `fetch` with no SDK. Both emit `onPhase` streaming events (`starting`, `thinking`, `calling_tool:<name>`, `tool_done:<name>`) and `onPartialText` deltas.
- **(llm)** Per-group tool coordinator in `src/lib/llm/tools/`: `add_member`, `resolve_name`, `resolve_payer`, `lookup_fx_rate`, `submit_drafts`, plus `registry.ts` exposing `primaryToolSpecs(group, planMode)` + `createAgentExecutor(group, deps)`. Mutating tools route through `PermissionPrompter`; interactive prompts (rate, payer) are user-driven.
- **(llm)** Reasoning-model support: `isReasoningModel()` swaps `max_completion_tokens` + `reasoning_effort` for GPT-5; `supportsOptionalThinking()` opts Claude 4.x into extended thinking with `thinkingBudgetFor(effort)`.
- **(llm)** Truncation auto-retry with quadrupled `max_tokens` up to `getModel(id).maxOutputTokens`; `TruncationError` surfaces as an actionable toast on cap.
- **(llm)** History pruning (`pruneHistory`) with soft budget at 60% of the model context window, preserving the last user→assistant pair and inserting a synthetic "earlier conversation hidden" marker.
- **(llm)** Zod schemas + strict JSON-Schema (`schema.ts`, `toJsonSchema`) for Anthropic `tool_use` and OpenAI `response_format.json_schema.strict`.
- **(llm)** Model registry (`models.ts`) with integer µUSD prices, context windows, image token math, and a `lastVerifiedIso` staleness check (CI-fails >365 days).
- **(llm)** Cost math (`cost.ts`) in integer µUSD with exactly two `Math.round` boundaries per turn.
- **(llm)** Preflight (`preflight.ts`): estimates tokens, rejects over-context requests without spending quota, rejects encoded-image payloads >5 MB.
- **(llm)** Prompt builder (`prompt.ts`) — `buildAgentSystemPrompt(ctx, groupName, tools, planMode)` with plan-mode block appended when active.
- **(chat)** Chat surface under `src/components/chat/`: `ChatPanel`, `Composer`, `MessageList`, `DraftCard`, `PendingBubble`, `TokenCostBar`, `InjectionBanner`, `ChatToolbar`, `ToolUseBubble`, and slash-command dispatch (`slashCommands.ts`: `/plan`, `/model`).
- **(chat)** Plan mode — behaviorally enforced by omitting `add_member` + `submit_drafts` from the tool list when active. Shift+Tab toggle in the composer; execute-plan handoff from plan-mode replies.
- **(chat)** Multimodal image pipeline (`src/lib/image.ts`): `accept` filter on JPEG/PNG/WebP, magic-byte MIME check, raw/encoded byte-size caps, no silent downscale.
- **(chat)** `PendingBubble` phase labels + live elapsed-time readout so 20–60s tool loops don't feel frozen; final `elapsedMs` persists on the assistant message.
- **(state)** Policy slice (`src/lib/policy.ts` + store): `allowedProviders`, daily/monthly µUSD caps, per-provider image consent, `persistHistory` toggle. `evaluatePolicy` gates every send.
- **(state)** Client-side rate limiter (`src/lib/rateLimiter.ts`) — 10/minute + 100/hour defaults, configurable; state persists across reloads so refresh cannot bypass.
- **(state)** Per-message cost tracker (`costTracker` in store) with daily/monthly µUSD roll-ups.
- **(state)** In-memory image cache (`src/state/imageCache.ts`) — image bytes never hit `localStorage`; persisted `ChatMessage` image blocks carry `base64: ''` and render as placeholders after reload.
- **(state)** Persisted-state migration to version 6.
- **(ui)** `SettingsDialog` — only surface for API-key entry, with reveal/re-mask on blur. `APIKeyHelpPanel` ships generation instructions, security disclosure, and clear-key guidance.
- **(ui)** `ConsentDialog` — one-time per-provider image-consent modal, with two-argument `onConsentNeeded(provider, resume)` handoff.
- **(ui)** `ToolConfirmDialog`, `RateInputDialog`, `PayerPromptDialog` — user-facing interstitials for mutating tools, FX-rate lookup, and ambiguous payer resolution.
- **(ui)** `Nav` gains an `onOpenSettings` callback; ⌘/Ctrl+, opens settings.
- **(lib)** Fuzzy member-name matcher (`src/lib/fuzzy.ts`) used by `resolve_name` tool.
- **(docs)** Per-directory `CLAUDE.md` rulebooks for chat, llm, state, components, components/ui, components/chat, tests.
- **(docs)** Repo skills: `qthink`, `qcode`, `qcheck`, `qtest`, `review-function`, `review-test`, `add-split-mode`, `add-llm-provider`, `commit`.
- **(docs)** Repo commands: `/qpullrequest`, `/qchangelog`.
- **(docs)** `code-quality-reviewer` agent for skeptical senior-architect reviews against TWC invariants.

### Changed

- **(docs)** Reconcile root `CLAUDE.md`, `README.md`, `src/lib/llm/CLAUDE.md`, `src/components/chat/CLAUDE.md`, `src/state/CLAUDE.md`, and `add-llm-provider/SKILL.md` to match the hardened architecture: `AgentClient` / `sendTurn` (not `LLMClient` / `sendMessage`), `tools/registry.ts` coordinator (no factory), `runTurn` loop driver, two-argument consent handoff, policy slice documented.
- **(docs)** Rewrite `README.md` to interactive production grade: centered header with inline favicon, shields.io badges (Pages deploy, last-commit, Node/Vite/React/Tailwind, license), live-demo CTA, anchored TOC, mermaid architecture diagram of the agentic loop, feature tables for the four split modes, nine currencies, two LLM providers, and seven safety rails, collapsible `<details>` quick-start + prerequisites + provider-key flows, chat-assistant deep-dive (slash commands, plan mode, tool registry, phase labels), directory-layout tree, deployment / contributing / license sections.
- **(docs)** Add `<meta name="description">` to `index.html` so live-demo link previews and search indexing have a one-line summary.
- **(build)** Bump `package.json` version to `0.1.0` to match the existing CHANGELOG entry (was stale at `0.0.0`).
- **(docs)** Add MIT license: new `LICENSE` file at repo root (MIT Expat text, © 2026 Randy Chan), `"license": "MIT"` field in `package.json`, and README badge + License section swapped from the "All rights reserved" stub to a wired MIT badge linking to `LICENSE`.

### Removed

- **(chat)** `src/components/LLMAssistant.tsx` — superseded by `src/components/chat/ChatPanel.tsx`.
- **(components)** `src/components/SettlementPanel.tsx` — unused dead code; live equivalent is `SettlementSection.tsx` rendered from `Shell.tsx`.
- **(llm)** `src/lib/llm/index.ts` factory — providers are now instantiated directly in `ChatPanel` (no indirection).
- **(llm)** `src/lib/llm/mockClient.ts` and `src/test/mockClient.test.ts` — real Anthropic + OpenAI clients replace the mock path.
- **(build)** `.github/workflows/deploy.yml` — replaced by the new deploy pipeline.

### Breaking Changes

- **(llm)** The public LLM interface renamed from `LLMClient` / `sendMessage` to `AgentClient` / `sendTurn`, and the provider factory (`src/lib/llm/index.ts`) was removed in favor of direct instantiation in `ChatPanel.tsx`. Any downstream code or skill that referenced the old names must move to the new ones.
- **(state)** Persisted-store version bumped to 6; `migrate` upgrades existing `twc-v1` users. Users on older versions without a compatible migration path will see a reset of the affected slices.
