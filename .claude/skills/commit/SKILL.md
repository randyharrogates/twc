---
name: commit
description: Use when the user asks for a commit or PR ready commit message. Generates a single Conventional Commits message from the staged diff. Never commits without explicit instruction.
---

# Commit

Generate a Conventional Commits message for the **currently staged** changes. Do not auto-stage. Do not auto-commit. Emit the message text; the user decides when to run `git commit`.

## Steps

1. Run `git status` and `git diff --staged`. If nothing is staged, say so and stop.
2. Infer the commit type:
   - `feat` — new user-facing capability
   - `fix` — bug fix
   - `refactor` — no behavior change
   - `perf` — measurable speed/bundle win
   - `test` — test-only change
   - `docs` — docs / CLAUDE.md / README only
   - `chore` — tooling, deps, formatting, CI
   - `style` — formatting-only (rare)
3. Write a **single-line title, ≤ 72 chars**, imperative mood, no trailing period. Optional scope in parens (`feat(split): …`). Focus on the *why* or the outcome, not the files touched.
4. If the change is non-trivial, add a body (blank line then wrapped at ~72). Explain motivation and any non-obvious tradeoff. One sentence is usually enough.
5. **No Claude / Anthropic / AI attribution.** No "Co-Authored-By" unless the user explicitly requests it.
6. Print the message. Do **not** run `git commit` unless the user explicitly says "commit it".

## Examples

```
feat(currency): support per-expense FX rate with rateHints pre-fill
```

```
fix(splits): distribute rounding remainder to keep Σ shares == total

Percent mode was emitting Σ = total − 1 minor unit when 100/N had a
remainder. Largest-remainder method now closes the gap deterministically.
```

```
refactor(store): move group mutations behind a single action creator
```
