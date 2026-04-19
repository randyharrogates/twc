# /qchangelog — generate CHANGELOG entries from the branch diff

Generate changelog entries and a PR summary by comparing all changes (staged + committed + pushed) against a base branch. After updating `CHANGELOG.md`, stage it and invoke the `commit` skill so the update lands on a clean Conventional Commits message.

**Usage**: `/qchangelog [base_branch]`

- `[base_branch]` — optional. The branch to diff against. Defaults to `main`. Accepts `main`, `dev`, `staging`, or any local/remote branch.

Examples:

```
/qchangelog
/qchangelog main
/qchangelog dev
```

## Steps

### 0. Resolve base branch

If no argument is supplied, use `main`. Verify the branch exists (local or remote):

```bash
git branch -a | grep -E "(^|\s)(remotes/origin/)?<base_branch>$"
```

If not found, stop with:
> Error: base branch `<base_branch>` not found. Try `/qchangelog main` or `/qchangelog dev`.

### 1. Get all changes vs base branch

**Step A — committed changes:**

```bash
git log --pretty=format:"%h|%s|%b" --no-merges <base_branch>..HEAD
```

Parse each commit into:
- **Hash**: short commit hash
- **Subject**: Conventional Commit header (type, scope, description)
- **Body**: commit message body (for `BREAKING CHANGE:` detection)

**Step B — staged changes (not yet committed):**

```bash
git diff --cached --stat
git diff --cached
```

Parse staged changes into:
- **Files changed**: modified/added/deleted file list
- **Diff content**: line-level changes for intent inference
- **Inferred type**: infer `feat`, `fix`, `chore`, etc. from the diff content and file paths (e.g. changes under `src/test/**` → `test`, changes under `src/lib/llm/**` adding a new provider → `feat(llm)`)

**Step C — pushed changes:**

```bash
git log --pretty=format:"%h|%s|%b" --no-merges <base_branch>..origin/$(git branch --show-current) 2>/dev/null
```

Combine all three sources into a unified set. Deduplicate by commit hash. Staged-but-uncommitted changes are inferred from the diff.

### 2. Parse Conventional Commits

For each commit/change, extract:

```
<type>[optional scope]: <description>
```

**Valid types (twc conventions, see `CLAUDE.md`):**

- `feat`: new features → **Added**
- `fix`: bug fixes → **Fixed**
- `perf`: performance improvements → **Changed**
- `refactor`: code refactoring → **Changed**
- `docs`: documentation → **Changed**
- `chore`: maintenance tasks → **Changed**
- `build`: build-system changes → **Changed**
- `test`: test additions/updates → **skip** (internal only)
- `style`: formatting-only → **skip**
- `ci`: CI configuration → **skip**

**Breaking change detection:**
- `!` suffix on type (`feat!:`, `fix!:`, `refactor!:`, etc.)
- Body contains `BREAKING CHANGE:` (case-insensitive)

**twc-specific scope conventions** — prefer these scopes when inferring from staged diffs:
- `currency` / `fx` — anything touching `src/lib/currency.ts` or the money invariant
- `split` — changes to `SplitMode` logic or largest-remainder settlement
- `llm` — `AgentClient` interface, providers, tool use, structured outputs
- `chat` — chat UI / multimodal draft pipeline
- `state` — Zustand stores under `src/state/**`
- `ui` — components under `src/components/ui/**`

### 3. Check if changes are already in CHANGELOG

Before proceeding, verify the identified changes aren't already documented:

1. For each commit hash, search `CHANGELOG.md`:

```bash
grep -F "<commit_hash>" CHANGELOG.md
```

2. For staged-only changes, search by inferred description/scope:

```bash
grep -i "<inferred_description>" CHANGELOG.md
```

**Decision:**
- **ALL** changes already in changelog → stop with: "All changes are already documented in CHANGELOG.md. No updates needed."
- **SOME** already present → process only the new ones.
- **NONE** present → full generation.

### 4. Categorize changes

Group by changelog category:

```
categories:
  Added:    []   # feat
  Fixed:    []   # fix
  Changed:  []   # perf, refactor, docs, chore, build
  Breaking: []   # any commit with a breaking-change marker
```

**Entry format:**
- With scope: `**(scope)** Description`
- Without scope: `Description`
- Preserve the original description after type/scope.

### 5. Auto-infer semantic version

**Step 1 — parse base version from `CHANGELOG.md`:**

```bash
grep -E "^## \[[0-9]+\.[0-9]+\.[0-9]+\]" CHANGELOG.md | head -1
```

If no versioned entry exists, use the current `package.json` `"version"` field (read it) as the base; fall back to `0.0.0` if both are missing.

**Step 2 — determine bump (highest priority wins):**

1. Any `BREAKING CHANGE` → **MAJOR** (reset minor and patch to 0)
2. Any `feat` → **MINOR** (reset patch to 0)
3. Any `fix` or `perf` → **PATCH**
4. Only `chore`/`docs`/`refactor`/`build` → **PATCH**

While twc is pre-1.0 (`0.x.y`), treat breaking changes as **MINOR** bumps and keep the major at `0`, per SemVer §4. Call this out in the PR summary when it applies.

### 6. Check for an existing entry with today's date

Search **versioned entries only** (ignore `[Unreleased]`):

```bash
grep -E "^## \[[0-9]+\.[0-9]+\.[0-9]+\] - $(date +%Y-%m-%d)" CHANGELOG.md
```

- **Found** → update existing entry (append to categories).
- **Not found** → create a new entry at the top.

### 7. Update CHANGELOG.md

#### Case A — new entry (date not found)

Insert at the top, after the header, before all existing entries:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- **(scope)** Description of feature

### Fixed

- **(scope)** Bug-fix description

### Changed

- **(scope)** Refactoring description

### Breaking Changes

- **(scope)** Breaking-change description
```

Only include categories with entries. Empty categories are omitted.

#### Case B — update existing entry (date found)

Append new entries to existing categories. Add new categories in standard order if needed (Added → Fixed → Changed → Breaking Changes).

### 8. Generate PR summary

Emit this block to stdout for the user to copy into a PR body (or into `pr_message.md` via `/qpullrequest`):

```markdown
# Summary of Changes

This PR includes {count} changes across the following areas:

## Added
- **(scope)** Feature description

## Fixed
- **(scope)** Bug-fix description

## Changed
- **(scope)** Refactoring description

## Breaking Changes
- **(scope)** Breaking-change description

---

## Version

**Auto-inferred version**: {new_version} (from {base_version})
- **Bump type**: {MAJOR|MINOR|PATCH}
- **Reason**: {breaking changes | new features | bug fixes | maintenance}

---

## Detailed Commit List

{hash} - {type}({scope}): {description}
...
```

### 9. Stage CHANGELOG.md and invoke `commit`

After updating `CHANGELOG.md`:

1. **Always stage the changelog:**

```bash
git add CHANGELOG.md
```

2. **Display the PR summary** from Step 8 so the user can copy it.

3. **Invoke the `commit` skill** to produce a Conventional Commits message covering the staged changes (CHANGELOG.md plus any previously staged files). Per the `commit` skill contract: generate the message only — do not run `git commit` unless the user explicitly asks.

## Edge cases

### No commits found (`<base_branch>..HEAD` empty)

Fall back to staged changes. If nothing is staged either: "No commits or staged changes found. Nothing to changelog."

### Current branch IS the base branch

Compare against the last tag instead:

```bash
git describe --tags --abbrev=0
git log <last-tag>..HEAD
```

If there are no tags, compare against `origin/<base_branch>`.

### No versioned entries in CHANGELOG.md

Use `package.json` `"version"` as the base, else `0.0.0`.

### CHANGELOG.md doesn't exist

Create it with the Keep a Changelog header before inserting the first entry.

### Merge commits

Skip any subject starting with `Merge pull request` or `Merge branch`. `--no-merges` in the `git log` flags above already handles this.

### Multiple scopes in the same category

Group by scope for readability; one bullet per (scope, change) pair.

### Only skipped types (`test`, `style`, `ci`) changed

Stop with: "Only internal changes (tests/style/ci) detected — nothing user-facing to changelog."

## Validation checklist

Before finalizing, verify:

- [ ] All commits from `<base_branch>..HEAD` are analyzed
- [ ] All staged changes are analyzed and included
- [ ] All pushed changes are analyzed and included
- [ ] Conventional Commits parsing is accurate
- [ ] Breaking changes are detected
- [ ] Version bump follows SemVer (with the `0.x` minor-as-breaking rule applied)
- [ ] Changelog categories follow Keep a Changelog format
- [ ] CHANGELOG.md is staged via `git add`
- [ ] `commit` skill is invoked after staging
