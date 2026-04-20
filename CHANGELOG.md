# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-20

### Added

- **(security)** Session-scoped passphrase vault for API keys (`src/lib/crypto.ts`, `src/lib/keyVault.ts`). PBKDF2-SHA256 600 000 iterations, AES-GCM-256, 12-byte random IV per value, 16-byte random salt; ciphertext encoded as a tagged `enc.v1.<iv>.<ct>` string stored in place of the plaintext inside `settings.apiKeys.<provider>`. Passphrase never persisted — only salt, iteration count, and an encrypted probe live in `settings.vault`. Pattern ported from `/Users/randychan/git/Leeseidon/src/lib/storage/`.
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
