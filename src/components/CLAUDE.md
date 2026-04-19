# src/components/ rules

- Presentational components receive data and callbacks via props. Screen-level components
  pull from the Zustand store via selectors and hand props down.
- **Tailwind only.** No inline `style=` except for genuinely dynamic values (e.g. a
  computed width). No CSS modules, no styled-components.
- Dialogs go through the shared `ui/Dialog` primitive — don't hand-roll modals.
- Every form control has an accessible label (`<label htmlFor>` or `aria-label`).
- No business logic: validation rules live in `lib/validation.ts`, split math in
  `lib/splits.ts`, FX in `lib/currency.ts`. Components call those, they don't reimplement.
- Keep components under ~200 lines. Break up before you hit that ceiling.

## Chat, settings, consent

- The chat UI lives in [`chat/`](chat/CLAUDE.md); read those rules before editing there.
- `SettingsDialog.tsx` is the only place that renders API-key fields. Keys are masked
  unless the user clicks "Reveal", and auto-re-mask on blur. `APIKeyHelpPanel.tsx` ships
  the three mandated UX pieces: generation instructions, security disclosure, clear-key
  instructions.
- `ConsentDialog.tsx` must fire before the first image upload to each provider. It is
  triggered from `ChatPanel` via the `onConsentNeeded` prop; `Shell.tsx` owns the open
  state and calls `grantImageConsent` on confirm.
- `Nav.tsx` takes an `onOpenSettings` callback — the gear icon opens the settings dialog.
  ⌘/Ctrl+, is the keyboard shortcut.
