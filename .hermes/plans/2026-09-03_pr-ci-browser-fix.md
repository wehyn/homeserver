# PR Browser CI Fix Plan

> **For Hermes:** Apply this small CI correction without changing application behavior or weakening browser coverage.

**Goal:** Make the Browser regression GitHub Actions job wait for the local Next.js server using a command available in the repository's installed toolchain.

**Root cause:** The workflow invokes `npx playwright wait-for-server`, but the installed Playwright CLI has no `wait-for-server` command. The PR's browser tests pass locally when Playwright starts the server through `playwright.config.ts`.

## Steps

1. Replace the unavailable CLI command in `.github/workflows/ci.yml` with a bounded shell loop using `curl` against `http://127.0.0.1:3000`, failing with the captured server log if the server does not become ready.
2. Verify the workflow diff and shell syntax without changing the browser test assertions.
3. Run the browser suite locally with the workflow's server mode, then run the full test, lint, build, service-worker syntax, and diff checks.
4. Commit the CI-only correction separately, push the PR branch, and verify the PR head points to that exact commit.
5. Re-run/inspect GitHub Actions and update the PR description so review status is reported truthfully.

## Acceptance

- No tests are removed, skipped, or weakened.
- The browser job no longer calls the unavailable `wait-for-server` command.
- Local browser tests and all repository checks pass.
- PR #82 remains a draft and points to the verified pushed head.
