# src/components/ui/ rules

These are presentational primitives — `Button`, `Input`, `Dialog`, `Drawer`, `NumberInput`, etc.

- **Zero domain knowledge.** Nothing in here knows about expenses, groups, members, currencies, or the store. If you're about to import from `state/` or `lib/splits.ts` in a file in this folder, you're in the wrong folder.
- API surface: props + `children` only. Forward refs where natural.
- Tailwind styling, minimal theme — neutral grays, single accent color.
- No controlled/uncontrolled ambiguity: pick one pattern per component and stick to it.
- `Drawer` shares the native-`<dialog>` + `showModal()` pattern with `Dialog` but
  overrides positioning to pin to the `right` or `left` edge. Width:
  `clamp(320px, 38.2vw, 720px)` (golden-ratio minor portion), full-width on narrow
  viewports. Slide-in animation via `@keyframes drawer-in-right` / `drawer-in-left`
  in `src/index.css`.
