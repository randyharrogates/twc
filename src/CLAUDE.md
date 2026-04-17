# src/ conventions

- **Imports grouped**: third-party first, then local (relative). No React default exports.
- **Named exports only.** No `export default` anywhere except `App.tsx` (Vite convention).
- **Shared types live in `src/types.ts`.** Narrow types colocate with their user.
- **IDs always come from `lib/id.ts`** (a `crypto.randomUUID()` wrapper). Never use names as IDs; two members can share a name.
- **No hardcoded currency codes, symbols, or decimals.** Read from `lib/currency.ts` (`CURRENCIES`, `CurrencyCode`).
- **No floats for money** outside `lib/currency.ts`'s FX-conversion boundary. See the root `CLAUDE.md` for the full rule.
