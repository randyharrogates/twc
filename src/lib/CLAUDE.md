# src/lib/ rules

Pure logic lives here. Nothing else.

- **No React imports. No DOM. No `localStorage`. No `Date.now()` without dependency injection** (take `nowMs: number` as a parameter when needed). Functions here must be deterministic given their inputs.
- **Every exported function has a Vitest test in `src/test/`** (filename mirrors: `lib/foo.ts` → `test/foo.test.ts`). No exceptions.
- Money functions take a `CurrencyCode` or `minorDecimals` parameter — never assume 2 decimals. JPY/KRW/TWD have 0 decimals.
- `splits.ts` must uphold `Σ shares === expense.amountMinor` (in the expense's own currency minor units) for every split mode. Use largest-remainder to distribute rounding.
- `settlement.ts` must uphold `Σ balances === 0` in base-currency minor units. Assert it at the top of `settle()` and throw with a descriptive error on violation — the assertion is itself a test for upstream bugs.
- FX conversion is the **only** sanctioned float boundary, lives only in `currency.ts`, always ends in `Math.round`.

## Crypto + key vault

- `crypto.ts` wraps the Web Crypto API (PBKDF2-SHA256 600 000 iterations, AES-GCM-256,
  12-byte IV, 16-byte salt). Pure: takes a `CryptoKey` handed in by the vault and
  produces/consumes `enc.v1.<iv>.<ct>` tagged strings. No DOM / React / localStorage.
- `keyVault.ts` is the session-scoped singleton. It imports `crypto.ts` and uses store
  actions for persistence — no direct `localStorage` access. The derived `CryptoKey`
  lives only in the vault's private memory; the passphrase is never persisted.
- Plaintext API keys are never persisted once a vault exists: `setApiKey` encrypts at
  save time when the vault is unlocked.
