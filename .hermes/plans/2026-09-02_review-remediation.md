# Dashboard Review Remediation Plan

> **For Hermes:** Implement each task with a failing regression test first; preserve all existing tests.

**Goal:** Close the independent review gaps by making the issue-to-evidence mapping explicit and adding deterministic browser coverage for the highest-risk dashboard behavior.

**Architecture:** Keep the existing same-origin Next.js app and pure helper tests. Extend the Playwright suite with route interception and DOM assertions so tests require no private services or credentials. Record an acceptance matrix that points from each issue to source files and executable tests.

**Scope:** Review findings for current branch `feat/dashboard-github-issues`, especially issue #77 coverage and evidence gaps. No push, merge, or issue closure is included.

---

### Task 1: Add the acceptance matrix

**Objective:** Document every requested issue (#61–#81 except #69), implementation location, and verification command.

**Files:**
- Create: `.hermes/plans/2026-09-02_dashboard-acceptance-matrix.md`

**Validation:** Check that all 20 issue numbers appear exactly once, every row names a source path and a test, and the matrix distinguishes unit/source-contract/browser evidence.

### Task 2: Add deterministic browser fixtures

**Objective:** Make Playwright start the app with mocked API responses and exercise modal, health/offline, metrics, sorting, and responsive behavior without external services.

**Files:**
- Modify: `tests/dashboard.spec.ts`
- Modify: `playwright.config.ts` only if fixture setup requires it

**Test-first checks:** Add one focused browser test at a time, run it red against the missing assertion, then implement only test setup/assertions and run it green.

**Validation:** `npx playwright test` passes with no credentials, no private service calls, and useful failure traces.

### Task 3: Verify service-worker and icon security paths

**Objective:** Cover worker update/offline routing and icon proxy rejection/allow-list behavior at deterministic seams.

**Files:**
- Modify: `tests/dashboard.spec.ts` or add focused Node tests under `lib/`

**Validation:** Assert API requests bypass the worker, static assets use network-first behavior, SVG/invalid signatures are rejected, and valid raster signatures are accepted.

### Task 4: Full verification and evidence review

**Objective:** Confirm the remediation does not regress existing behavior and the matrix is accurate.

**Validation:** Run `npm test`, `npm run lint`, `npm run build`, `npx playwright test`, `node --check public/sw.js`, `git diff --check`, and verify no tests are deleted, skipped, or weakened.
