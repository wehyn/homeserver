# PR Browser CI Fix Plan

> **For Hermes:** Apply this small CI correction without changing application behavior or weakening browser coverage.

**Goal:** Make the Browser regression GitHub Actions job wait for the local Next.js server using a command available in the repository's installed toolchain.

**Root cause:** The workflow first starts Next.js manually, then invokes `npx playwright wait-for-server`, a CLI command that does not exist in the installed Playwright version. Starting the app manually is unnecessary because Playwright's `webServer` configuration already owns the server lifecycle.

**Approach:** Keep one owner for browser-server lifecycle: let `playwright.config.ts` start and wait for Next.js. Remove the duplicate workflow startup and unavailable wait command rather than weakening CI reuse settings.

## Steps

1. Remove the manual Start/Wait application steps from `.github/workflows/ci.yml`; `npx playwright test` will use the existing `webServer` configuration.
2. Verify the workflow diff and confirm no unavailable CLI command remains.
3. Run the browser suite locally with Playwright-managed server startup, then run the full test, lint, build, service-worker syntax, and diff checks.
4. Commit the CI-only correction separately, review the exact new head, push the PR branch, and verify the PR head points to that exact commit.
5. Re-run/inspect GitHub Actions and update the PR description so review status is reported truthfully.

## Acceptance

- No tests are removed, skipped, or weakened.
- The browser job no longer calls the unavailable `wait-for-server` command.
- Local browser tests and all repository checks pass.
- PR #82 remains a draft and points to the verified pushed head.
