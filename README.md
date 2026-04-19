# twc

A frontend-only Splitwise-style expense splitter. Log who paid for what in a shared
group, pick how each expense is split, and see a minimized "who owes whom" settlement.
Supports nine currencies (SGD, MYR, USD, KRW, JPY, TWD, EUR, GBP, THB) with user-entered
FX rates.

Ships with a multimodal chat assistant: drop in a receipt photo plus free-form notes and
a vision-capable model (Claude or GPT-4) emits parsed expense drafts that the user
reviews and accepts. Deployable to GitHub Pages with a **bring-your-own-API-key** model
— no backend required.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Zustand · Vitest · Zod.

## Run

```sh
npm install
npm run dev     # http://localhost:5173/twc/
npm run test    # vitest
npm run build   # production bundle
npm run lint    # eslint .
```

## Bring-your-own API key

Real providers (Anthropic, OpenAI) use a key you paste into Settings → Providers. The
key lives in this browser's `localStorage` under `twc-v1`. Security disclosure is shown
in the settings dialog; the key is redacted from `exportState()` and never appears in
request bodies.

To clear a key: Settings → Providers → Clear key, or delete `settings.apiKeys.<provider>`
from DevTools → Application → Local Storage → `twc-v1`.

## Safety rails

- **Client-side rate limiter** — 10 requests per minute, 100 per hour (defaults,
  configurable). Framed as a cost/abuse guard, not DDoS protection.
- **Per-provider spend caps** — $5/day, $50/month defaults in Settings → Policy. Sends
  are blocked when the estimated cost would breach the cap.
- **Per-provider image consent** — a one-time modal before the first image upload to each
  provider explains what is sent.
- **Magic-byte MIME check** — uploaded files must be JPEG / PNG / WebP by both declared
  MIME *and* actual bytes; mismatch is rejected.
- **Persistent image bytes never hit `localStorage`** — they live in an in-memory cache
  that is lost on reload.
- **Preflight** rejects requests that would exceed the model's context window without
  spending a request quota.

## Proxy upgrade path

If a shared-key mode is ever needed, a ~60-line Cloudflare Worker injects the key
server-side and forwards to Anthropic / OpenAI. `ChatPanel.tsx` instantiates the
provider directly today (`provider === 'anthropic' ? new AnthropicClient({...}) : new
OpenAIClient({...})`); adding a proxy mode means extending that conditional with a
third branch that constructs a `ProxyClient` against the worker URL. Not built now;
documented here.

## Design rules

See `CLAUDE.md` for project-wide rules (money invariant, currency allow-list, commit
style). Each subdirectory has its own `CLAUDE.md` with local rules.
