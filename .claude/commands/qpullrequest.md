# /qpullrequest — generate a PR body from the branch diff

Compare the current branch against a target branch and produce a GitHub-ready PR message. Saves to `pr_message.md` in the project root (gitignored) so the user can copy-paste into GitHub.

**Usage**: `/qpullrequest <base_branch> [TRU-####]`

- `<base_branch>` — required. The branch to diff against (`main`, `dev`, `staging`).
- `[TRU-####]` — optional. A Notion issue tag; linked in the "Related Issues" section when provided.

Examples:

```
/qpullrequest dev
/qpullrequest main TRU-1694
```

## Steps

### 0. Validate arguments

If no base branch is given, stop:
> Error: base branch required. Usage: `/qpullrequest <base_branch> [TRU-####]`.

Verify the branch exists (local or remote):

```bash
git branch -a | grep -E "(^|\s)(remotes/origin/)?<base_branch>$"
```

If not found, stop with that error.

If a Notion tag is provided, validate it matches `TRU-\d+`. If the format is off, warn but continue without linking it.

### 1. Collect commits

```bash
git log <base_branch>..HEAD --pretty=format:"%h|%s|%b" --no-merges
git log <base_branch>..HEAD --oneline --no-merges
```

Skip `Merge pull request` / `Merge branch` commits. Parse each into `{hash, type, scope, description, breaking}` using Conventional Commits shape (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `style`; `!` suffix or `BREAKING CHANGE:` in body → breaking).

If no commits, stop:
> No commits on HEAD that aren't in `<base_branch>`. Nothing to generate.

### 2. Collect diff stats

```bash
git diff <base_branch>...HEAD --stat
git diff <base_branch>...HEAD --name-status
```

### 3. Categorize commits

- **Added** — `feat`
- **Fixed** — `fix`
- **Changed** — `refactor`, `perf`, `docs`, `chore`, `build`
- **Breaking** — any commit with `!` or `BREAKING CHANGE:`

Skip `test`, `style`, `ci` from the user-visible Changes section.

### 4. Generate the message

All checklist items must be `- [x]`. Omit items (and whole sections) that don't apply — no unchecked boxes, no empty sections.

```markdown
## Overview

<2–4 sentence paragraph. Explain what this PR does and WHY — the motivation,
not a restatement of the commit list. Synthesize across all commits.>

## Related Issues

Notion: [TRU-####](https://www.notion.so/TRU-####)

## Type of Change

- [x] New feature (non-breaking change that adds functionality)
- [x] Bug fix (non-breaking change that fixes an issue)
- [x] Refactoring (no functional changes)
- [x] Documentation update

## Changes

### Added
- **(scope)** Description

### Fixed
- **(scope)** Description and root cause

### Changed
- **(scope)** Description

### Breaking Changes
- **(scope)** Description and migration notes

## Test Plan

- [x] `npm run lint` passes
- [x] `npm run test` passes
- [x] `npm run build` passes
- [x] <Specific scenario relevant to this PR — e.g. "JPY↔USD settlement matches hand-calc">

## Commits

| Hash | Commit |
|------|--------|
| `abc1234` | feat(scope): description |
| `def5678` | fix(scope): description |

## Files Changed

\`\`\`
<output of git diff --stat>
\`\`\`
```

Filling notes:

- **Overview**: coherent paragraph focused on the "why". Not bullets. Not a commit restate.
- **Related Issues**: present only when `TRU-####` was given. Otherwise omit the whole section.
- **Type of Change**: include only the rows that apply based on commit types. Every listed row is `- [x]`.
- **Changes**: omit sub-headings that are empty. If all commits are `test`/`style`/`ci` only, warn the user — the Changes section will be empty and likely needs prose.
- **Test Plan**: include the three lint/test/build lines if they were run, and add any scenario called out in commit bodies (e.g. cross-currency FX, payer-not-in-split).

### 5. Save and display

Write the generated message to `pr_message.md` at the repo root (overwrite existing), then print it to stdout. Inform the user:

> PR message saved to `pr_message.md`.

## Edge cases

- **No argument** — stop with usage error.
- **Branch not found** — stop with the branch error.
- **No commits vs base** — stop after step 1.
- **No Notion tag** — omit "Related Issues" entirely.
- **test/style/ci-only commits** — warn; still generate with an empty Changes section.

## Checks before saving

- `<base_branch>` validated and exists.
- `TRU-####` matches format or was omitted cleanly.
- All non-merge commits from `<base_branch>..HEAD` accounted for.
- "Type of Change" rows match actual commit types.
- Overview is prose, not bullets.
- Empty sections omitted.
- `pr_message.md` written to project root.
