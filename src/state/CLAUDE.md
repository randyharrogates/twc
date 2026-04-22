# src/state/ rules

- **One Zustand store**, persisted via `persist` middleware.
- **localStorage key stays `twc-v1`.** Bump the numeric `version` (currently `8`) every
  time the persisted shape changes; add a `migrate` function in the same commit. Never
  change the storage key — that orphans existing user data. The "v2, v3…" shorthand is
  the persist-version number, not the storage-key name.
- **Actions are the only mutation path.** Nothing outside `store.ts` calls `set()`.
  Components read via selectors and call action methods.
- Selectors returning arrays/objects should use `useShallow` (from
  `zustand/react/shallow`) to avoid render storms. The `useActiveConversation` fallback
  returns a shared `EMPTY_CONVERSATION` constant so null-group calls don't create a fresh
  object every render.
- Money stays in integer minor units in the store. Conversion to base is computed on
  demand in selectors, not stored.
- **Image bytes are never persisted.** `ChatMessage` image blocks are stored with
  `base64: ''`; the full data lives in `imageCache.ts` (module-level `Map`) and is lost on
  reload. Rationale: a 5 MB image × a handful of messages would blow the 5 MB
  localStorage quota. This is a permanent rule.
- **API keys in `settings.apiKeys` are plaintext until the user sets a passphrase via
  `setupVault`**, at which point each stored value is encrypted in place and stored as
  `enc.v1.<iv>.<ct>`. The passphrase-derived `CryptoKey` lives only in `KeyVault`'s
  private memory; it is never persisted. `settings.vault` holds salt + iterations + a
  probe row for unlock verification. `vaultUnlocked: boolean` is a non-persisted
  top-level field that drives UI. Persist version is now 8; migration from v7
  additively sets `settings.localModel = defaultLocalModel()` and
  `policy.imageConsentByProvider.local = false`. `setApiKey` is async and throws
  `VaultLockedError` when the vault is set up but locked. `apiKeys.local` is
  optional — when blank, no `Authorization` header is sent and the vault
  encrypt/unlock pipeline does not run for it. `wipeVault` clears the vault meta
  AND all stored API keys (anthropic, openai, and local). Keys are redacted from
  `exportState()` (empty string in the export) and never appear in request bodies
  or `console.log`.
- **`settings.localModel`** holds the user-declared local-server config: `baseUrl`
  (validated against the `isAllowedLocalBaseUrl` allow-list at save time),
  `modelName` (the wire tag, e.g. `qwen2.5-vl:7b`), `contextWindowTokens`,
  `maxOutputTokens`, and `supportsVision`. Use the `setLocalModel(settings)`
  action to write it — the action re-runs URL allow-list validation defensively
  and rejects out-of-range token counts. `ChatPanel` mirrors the cap fields into
  `lib/llm/models.ts` via `setLocalModelRuntime(...)` so `getModel('local')`
  returns the user's values.
- **Rate-limiter state persists** so refresh does not bypass the cap. `consumeRateToken`
  is pure (delegates to `lib/rateLimiter.ts`); the action injects `Date.now()` once per
  call.
- **Concurrency across tabs is not synchronized.** Each tab has its own in-memory
  Zustand; a write in tab A is not reflected in tab B until reload. Acceptable for a
  single-user expense splitter.

## Policy slice

The store carries a `policy: Policy` field (`store.ts:79`) that gates the chat
assistant. Actions that write it: `setAllowedProviders`, `setDailyCap`, `setMonthlyCap`,
`grantImageConsent`, `setPersistHistory`, `resetPolicy`. `ChatPanel` feeds `policy` and
`costTracker` into `evaluatePolicy(...)` before every send — decisions surface as
toasts, not silent drops.

- `allowedProviders: Provider[]` — empty means "none allowed"; the send path blocks.
  `Provider` is `'anthropic' | 'openai' | 'local'`.
- `dailyCapMicros` / `monthlyCapMicros` — µUSD ceilings checked against `costTracker`.
  Local-provider sends record zero cost (price tables are zeroed in `models.ts`),
  so caps never trip from local traffic.
- `imageConsentByProvider: Record<Provider, boolean>` — flipped to `true` by
  `grantImageConsent(provider)` after the user confirms `ConsentDialog`. The
  local-provider consent copy reminds the user the image is going to **their
  configured Base URL**, not a third party.
- `persistHistory: boolean` — when `false`, the `partialize` function at `store.ts:600`
  writes `conversations: {}` into persisted state, so chat history is kept in memory
  only and lost on reload. Flip this when a user opts out of history persistence.
