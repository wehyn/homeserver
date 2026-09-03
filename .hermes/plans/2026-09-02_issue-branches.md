# Issue Branch Separation Plan

> **For Hermes:** Keep the integrated branch as a safety reference. Do not push, merge, or close issues.

**Goal:** Organize the completed dashboard work into independently reviewable issue branches so future pull requests can be opened one issue at a time.

**Repository:** `/home/dei/dev/dashboard`
**Base:** `2c0c30ea21f328687cee1e337870141f3d7b4f03`
**Integrated source branch:** `feat/dashboard-github-issues`

## Approach

1. Inspect the current worktree, commit-to-file mapping, existing worktrees, and uncommitted browser-test changes before changing refs.
2. Preserve the integrated branch unchanged as the complete reference.
3. Keep the current uncommitted browser fixture work safe; assign it to the #77 branch only after its focused tests pass.
4. Create one branch per issue from the exact base, using cherry-picked issue-specific commits where they are already isolated and path-scoped extraction/splitting where commits combine issues.
5. For shared files, retain only the smallest coherent changes needed by that issue and record dependencies in each branch note. Do not claim a branch is independently mergeable until it passes the repository checks.
6. Verify every created branch's base, changed paths, commit history, and status. Leave all branches local; no push or PR side effects.

## Branch naming

Use `issue/<number>-<short-slug>` for #61–#81, excluding #69. Keep the existing integrated branch and existing agent worktrees untouched unless a branch name collision requires inspection.

## Verification

- No source/test files are deleted or skipped.
- Each issue branch is based on the exact base commit.
- `git diff --check` passes for every branch.
- The #77 branch runs the browser suite; each branch runs focused tests and the full suite when its files are changed.
- The integrated branch remains recoverable at its pre-separation tip.
