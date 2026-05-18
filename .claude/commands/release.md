---
description: Bump version, update CHANGELOG, tag, push. Triggers GitHub Actions multi-platform build.
argument-hint: "<patch|minor|major|x.y.z> [--push]"
allowed-tools: Bash(npm run *), Bash(node scripts/release.js *), Bash(git status), Bash(git diff*), Bash(git log*), Bash(git push*), Bash(gh *), Read, Edit, Glob, Grep
---

# Release new version

Run the full release workflow for the LuminaKraft Launcher.

## Arguments
The user invoked: `/release $ARGUMENTS`

Parse `$ARGUMENTS` as:
- First token: bump type `patch` | `minor` | `major`, or explicit version `X.Y.Z` (with optional `-suffix` for prereleases like `0.2.0-beta.1`).
- Second token (optional): `--push` → push tag immediately after tagging (triggers CI build).

If `$ARGUMENTS` is empty, ask the user which bump type they want before proceeding.

## Pre-flight (REQUIRED)

Stop immediately if any of these fail. Do NOT bump version with a dirty tree or broken tests.

1. `git status --porcelain` — must be empty. If not, list dirty files and ask user to commit/stash first.
2. Confirm on `main` (or warn if on a branch): `git branch --show-current`.
3. `git pull --ff-only` — sync with origin.
4. `npm run lint` — must pass with 0 warnings.
5. `npm run test` — must be 100% green.
6. `cd src-tauri && cargo check && cargo test` — both pass.

If any check fails, abort with a clear summary of what to fix.

## Step 1 — Compute new version

- Read current version from `package.json`.
- If user passed `patch`/`minor`/`major`: compute next semver.
- If user passed explicit `X.Y.Z`: validate format `^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$`.
- Print the new version and ask user to confirm before continuing.

## Step 2 — Update CHANGELOG.md

The release script does NOT touch CHANGELOG.md. You must add the entry manually before running the script.

1. Read recent git log since the last release tag:
   ```
   git log <previous-tag>..HEAD --oneline --no-merges
   ```
   (Get previous tag via `git describe --tags --abbrev=0`.)
2. Group commits by Conventional Commit prefix:
   - `feat:` / `feat(...)` → `### ✨ New Features`
   - `fix:` → `### 🐛 Bug Fixes`
   - `perf:` → `### ⚡ Performance`
   - `refactor:` → `### ♻️ Refactor`
   - `chore:` / `docs:` / `test:` / `ci:` → `### 🔧 Maintenance` (omit if empty or noisy)
3. Insert a new section ABOVE the most-recent existing version section. Format:
   ```markdown
   ## [<new-version>] - YYYY-MM-DD

   ### ✨ **New Features**
   - <one bullet per feat: commit, rephrased for end users>

   ### 🐛 **Bug Fixes**
   - <one bullet per fix:>

   ### ⚡ **Performance**
   - <one bullet per perf:>
   ```
   Use today's date from `Today's date` in the system context. Match the heading style + emoji used by previous entries (look at lines 8-30 of CHANGELOG.md as a template).
4. Drop commits that are purely internal noise (version-bump commits from previous releases, dependabot bumps, CHANGELOG-only commits, CI-only tweaks).
5. Show the proposed CHANGELOG diff to the user and wait for confirmation before writing it.

## Step 3 — Run the release script

The script bumps the version in **all 4 files** (package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json, src/components/Layout/Sidebar.tsx), commits everything, and tags. **Never edit those 4 files by hand.**

Choose the right invocation based on user input:
- `patch` / `minor` / `major` → `npm run release:<type>` (no push) or `npm run release:<type>-push`
- explicit `X.Y.Z` → `node scripts/release.js <X.Y.Z>` (script prompts for confirmation; pipe `y\n` if running non-interactively, e.g. `echo "y" | npm run release ...`). Add `--push` if requested.

If the version contains a `-suffix` (prerelease), the script will set `isPrerelease: true` automatically.

## Step 3.5 — Fold CHANGELOG into the release commit

`release.js` only stages the 4 version files — it does NOT pick up your CHANGELOG.md edit. After the script finishes, `CHANGELOG.md` will be left uncommitted. Fold it into the release commit:

```
git add CHANGELOG.md
git commit --amend --no-edit
git tag -f v<new-version>
```

This is safe: the release commit has not been pushed yet, so amending it and re-pointing the tag rewrites only local history. (Amending is normally discouraged — it's correct here only because the commit is unpushed and the CHANGELOG logically belongs in it.)

## Step 4 — Verify post-release state

After the script returns:
1. `git log -1 --format="%H %s"` — confirm the bump commit landed.
2. `git show --stat HEAD` — confirm it includes CHANGELOG.md + the 4 version files.
3. `git tag --points-at HEAD` — confirm tag `v<new-version>` exists and points at the amended commit.
3. Verify all 4 version files are in sync:
   ```
   grep -h '"version"' package.json src-tauri/tauri.conf.json
   grep '^version = ' src-tauri/Cargo.toml
   grep 'currentVersion' src/components/Layout/Sidebar.tsx
   ```
4. If `--push` was NOT used and user wants to ship now, push manually: `git push && git push --tags`.
5. After push, GitHub Actions takes over: `.github/workflows/build-and-release.yml` builds Windows/macOS/Linux, generates `latest.json`, creates the GitHub Release. Tail the run with `gh run watch` (or `gh run list --workflow=build-and-release.yml --limit 1` to get the URL).

## Step 5 — Report

Print a final summary:
- Old version → new version
- Tag name
- Whether pushed yet
- Link to the GitHub Actions run (if pushed)
- Reminders for things outside this command's scope (Discord announcement, Twitter, etc.)

## Hard rules

- NEVER edit `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/components/Layout/Sidebar.tsx` version fields by hand — only `scripts/release.js` does that.
- NEVER add `Co-Authored-By` or AI attribution to release commits. The release script writes the commit; if it ever changes, keep credits out.
- NEVER skip the pre-flight checks. CI runs the same; failing locally now saves a broken release.
- NEVER `git push --force` on main or on a release tag.
- If `--no-verify` would be tempting because a hook fails, STOP and fix the hook's complaint instead.
- If user invokes the command on a non-`main` branch, warn and ask for explicit confirmation before bumping.
