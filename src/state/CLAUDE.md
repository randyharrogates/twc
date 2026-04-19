# src/state/ rules

- **One Zustand store**, persisted via `persist` middleware.
- **localStorage key stays `twc-v1`.** Bump the numeric `version` (currently `6`) every
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
- **API keys are plaintext in `settings.apiKeys`.** They are redacted from
  `exportState()` (empty string in the export) and never appear in request bodies or
  `console.log`. Users can clear them via `clearApiKey(provider)` or DevTools → Application
  → Local Storage → `twc-v1`.
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
- `dailyCapMicros` / `monthlyCapMicros` — µUSD ceilings checked against `costTracker`.
- `imageConsentByProvider: Record<Provider, boolean>` — flipped to `true` by
  `grantImageConsent(provider)` after the user confirms `ConsentDialog`.
- `persistHistory: boolean` — when `false`, the `partialize` function at `store.ts:600`
  writes `conversations: {}` into persisted state, so chat history is kept in memory
  only and lost on reload. Flip this when a user opts out of history persistence.
