# Issue #71 Accessible Process Tables Implementation Plan

> **For Hermes:** Implement this plan in the assigned worktree with strict TDD. Issue #78 is out of scope and owned by another agent.

**Goal:** Improve the process tables in `app/system-details-modal.tsx` so their captions and sortable controls are accessible without changing existing keyboard behavior or unrelated issue #78 work.

**Architecture:** Inspect the existing process-table markup and test setup first. Add deterministic tests for the observable accessibility contract, extracting a small pure label helper only if that makes the sort-label behavior straightforward to test in Node. Then update the table markup: add an accessible caption, make each sort button's `aria-label` stateful with its field and current/next direction, and mark decorative `ArrowUpDown` icons hidden from assistive technology. Keep native `<button>` keyboard activation and existing sort state transitions intact.

**Tech Stack:** Next.js/React, TypeScript, the repository's existing test runner, ESLint, and production build.

---

## Scope and constraints

- Work only on GitHub issue #71 in `/home/dei/dev/dashboard-wt-css` on the assigned branch.
- Do not implement, modify, or merge issue #78.
- Inspect `AGENTS.md` and the current `app/system-details-modal.tsx` before choosing exact test files and selectors.
- Create and run failing tests before writing production code; never remove or weaken existing tests.
- Preserve existing sort interaction and keyboard behavior.
- Stop any development servers before `npm run build`.
- Do not push or merge.

## Implementation sequence

### Task 1: Inspect repository conventions and current behavior

- Read `AGENTS.md`, package scripts, existing test configuration, and `app/system-details-modal.tsx`.
- Identify every process table and its sortable columns, current sort state, button markup, and `ArrowUpDown` usage.
- Check the worktree is clean enough to isolate issue #71 and note any pre-existing changes; do not touch unrelated work.

### Task 2: Add the first failing accessibility test

- Add focused tests using the repository's established test framework and rendering utilities.
- Assert the process table exposes an accessible caption.
- Assert sort controls expose labels that name the sort field and communicate the current or next direction based on state.
- Assert decorative `ArrowUpDown` icons are hidden from assistive technology.
- Include a keyboard activation assertion or preserve the existing interaction test if one already covers it; do not replace a stronger existing test with a weaker one.
- Run only the new focused test and confirm it fails for the missing issue #71 behavior, not because of a test typo or environment setup problem.

### Task 3: Implement the minimum caption and stateful labels

- Add a caption to each process table with useful accessible text; use visually-hidden styling only if the visual design requires captions not to be displayed.
- Add stateful `aria-label` values to sortable buttons. Labels must include the field being sorted and either the current direction or the direction activated by the next press, matching the chosen wording consistently.
- Add `aria-hidden="true"` to decorative `ArrowUpDown` icons (or the repository's equivalent supported prop) while leaving the icon visible.
- Keep the existing `<button>` elements, click handlers, sort state, and focus/keyboard semantics unchanged.
- If repeated label construction would be unclear or difficult to test, extract a pure TypeScript helper and test it deterministically; avoid unrelated refactoring.

### Task 4: Verify the focused behavior and regressions

- Re-run the focused accessibility test and confirm it passes.
- Run the full `npm test` suite and address only regressions caused by the issue #71 change.
- Run `npm run lint`.
- Ensure no issue #78 files or behavior were changed.

### Task 5: Build and commit issue #71 separately

- Check for running development servers and stop them before building.
- Run `npm run build` and record the real result.
- Review `git diff` and `git status` to confirm only the plan, issue #71 production code, and issue #71 tests are included; do not include unrelated changes.
- Commit the issue #71 implementation separately with a focused message, for example `fix: improve process table accessibility (#71)`.
- Verify the commit contains the intended files and capture the exact commit SHA. Do not push or merge.

## Likely files

- Create: `.hermes/plans/2026-09-02_000000-issue-71-accessible-process-tables.md`
- Modify: `app/system-details-modal.tsx`
- Modify or create: the repository's focused test file discovered during inspection (possibly under `__tests__/`, `tests/`, or adjacent to the component)
- Optional: a small pure helper under `lib/` only if required by deterministic tests

## Validation commands

Run the repository-specific focused test command discovered from `package.json`/test config, then:

```bash
npm test
npm run lint
npm run build
```

Before finalizing, verify the focused test, full suite, lint, and build outputs, the exact commit SHA, and any blockers. Report issue #71 only.

## Risks and decisions

- The exact caption text and sort-label convention must follow the current UI and existing tests after inspection.
- If there are multiple process tables, each must receive the required accessible caption and its own sort labels.
- Avoid adding duplicate accessible names: decorative icons should not contribute names, while button text/labels remain usable.
- Native buttons should be retained so Enter/Space keyboard activation and focus behavior continue to work.
