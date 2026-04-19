# src/components/chat/ rules

The chat surface lives entirely here. `ChatPanel` is the screen-level container (rendered
as a modal from `Shell` on ⌘K); everything else is a presentational child it composes.

- **Image handling runs through `lib/image.ts`.** Composer must: (a) filter `<input>`
  `accept` to `image/jpeg,image/png,image/webp`, (b) verify magic bytes before encoding,
  (c) reject files whose declared MIME disagrees with their bytes, (d) reject raw files
  over `MAX_RAW_FILE_BYTES` and encoded size over `MAX_IMAGE_BYTES_POST_B64`. No silent
  downscale, no canvas re-encode.
- **Image bytes live only in `src/state/imageCache.ts`, never in persisted store state.**
  Persisted `ChatMessage` image blocks carry `base64: ''`. After reload, previously-sent
  images render as "image removed" placeholders. This is by design to stay under the
  localStorage quota.
- **Never log request bodies or API keys.** Error toasts show typed-error messages from
  `errors.ts`; do not include the raw response body in anything that might reach the
  console.
- **Draft acceptance flows through `store.acceptDrafts`**, which calls the existing
  `addExpense` action. Drafts are not validated a second time in the UI — the Zod schema
  already validated them at the provider boundary.
- **Rate-limiter + policy checks run in `ChatPanel` before `runTurn`.** Do not skip
  them. If a check fails, surface the reason in a toast; do not fall through to the
  provider.
- **`PendingBubble` renders a phase label** (`thinking…`, `resolving name…`, `looking up
  FX rate…`, `preparing drafts…`) alongside the streaming text, driven by the
  `onPhase` callback threaded through `runTurn`. The bubble keeps the streaming cursor
  for text; the phase label sits above it and updates at tool boundaries. The bubble
  also ticks a live elapsed timer (`phaseSeconds`, plus `(total Xs)` once the phase
  advances past `starting`) so 20–60s tool loops don't feel frozen. It lives in
  [`PendingBubble.tsx`](PendingBubble.tsx); `ChatPanel` captures `turnStartedAt` via
  `performance.now()` when a turn begins, emits a fresh `phaseStartedAt` whenever the
  phase *key* (`calling_tool:<name>` or `kind`) changes, and persists the final
  `elapsedMs` on the last-assistant `ChatMessage` alongside `usage` / `modelId`.
- **Execute-plan handoff.** When the model replies under plan mode, the last-assistant
  message carries `sentInPlanMode: true`. `MessageList` renders an **Execute this plan**
  button under that bubble as long as it has no `drafts` yet and no later user message
  has been sent. Clicking it calls `runSend([{type:'text', text:'Execute the plan
  above.'}], { planModeOverride: false })` — that turn runs with `submit_drafts` +
  `add_member` available and produces drafts without touching the global `planMode`
  setting.
- **Per-provider consent** is gated via `ConsentDialog` outside this folder and requested
  by calling the `onConsentNeeded(provider, resume)` prop from `ChatPanel`. The second
  argument is a `resume: () => Promise<void>` callback that re-runs the suspended send
  once the user grants consent — `ChatPanel` passes a closure bound to the same
  `runSend(blocks, options)` invocation. Don't grant consent from inside chat
  components.
- Components under ~200 lines; break out new ones here rather than stuffing more into
  `ChatPanel`.
- **`ChatToolbar`** sits directly above `Composer` and exposes a `[Model ▾] [Chat | Plan]`
  control. Models whose provider lacks an API key are disabled in the dropdown.
  Selecting a model calls both `setModelOverride(id)` and `setLLMProvider(model.provider)`.
- **Slash commands in `Composer`** are intercepted before `onSend`: when the trimmed
  text starts with `/`, `onSlashCommand(text)` runs. Dispatch logic lives in
  `slashCommands.ts` (pure function, tested in `test/components/chat/slashCommands.test.ts`).
  Supported: `/plan [on|off|toggle]`, `/model [<id>]`. Unknown commands surface an error
  banner; recognised commands show a one-line success `notice` in the green inline
  banner above the composer.
- **Shift+Tab toggles plan mode** when the textarea is focused. `Composer` calls
  `onTogglePlanMode()` — the state itself is owned by the Zustand store
  (`settings.planMode`).
- **`PayerPromptDialog`** is owned by `Shell.tsx` (mirrors `RateInputDialog`). The
  agent's `PayerPrompter.requestPayer` resolves a promise when the user picks or
  cancels. Cancellation surfaces as `{payerId: null}` and the model is instructed to
  stop the tool loop.
