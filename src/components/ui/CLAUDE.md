# src/components/ui/ rules

These are presentational primitives — `Button`, `Input`, `Dialog`, `NumberInput`, etc.

- **Zero domain knowledge.** Nothing in here knows about expenses, groups, members, currencies, or the store. If you're about to import from `state/` or `lib/splits.ts` in a file in this folder, you're in the wrong folder.
- API surface: props + `children` only. Forward refs where natural.
- Tailwind styling, minimal theme — neutral grays, single accent color.
- No controlled/uncontrolled ambiguity: pick one pattern per component and stick to it.
