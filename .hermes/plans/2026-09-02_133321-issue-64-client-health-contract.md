# Issue 64 Client Health Contract Implementation Plan

> **For Hermes:** Execute this plan task-by-task with strict RED-GREEN-REFACTOR TDD.

**Goal:** Make client health refreshes accept only a validated, successful API contract, distinguish request/API failures from service statuses, and ignore stale results for changed or deleted apps.

**Architecture:** Add a client-safe health contract/result helper under `lib/` with pure validation and result classification. Keep `/api/health` SSRF validation, timeout, and persisted status behavior unchanged. Update `app/page.tsx` to use `Promise.allSettled`, preserve app state on failures, and guard both request version and the checked app identity/target before applying results.

**Tech Stack:** TypeScript, Next.js client component, Node built-in test runner.

---

### Task 1: Define the health response contract in a pure helper

**Files:**
- Create: `lib/health-client.ts`
- Test: `lib/health-client.test.ts`

**RED:** Add tests for accepting `{status: "online"|"degraded"|"offline"|"unknown"}`, rejecting missing/invalid status values and non-object JSON, and classifying malformed payloads as API failures rather than service statuses. Run the focused test and confirm it fails because the helper is absent.

**GREEN:** Implement the smallest exported contract type and parser/classifier needed by the tests. Include an explicit result union for valid health status versus API failure; do not treat malformed JSON or missing status as `unknown`.

**VERIFY:** Run `node --experimental-strip-types --test lib/health-client.test.ts` and then `npm test`.

### Task 2: Use the contract and `Promise.allSettled` in the dashboard

**Files:**
- Modify: `app/page.tsx`
- Test: `lib/health-client.test.ts`

**RED:** Extend pure tests to prove settled health outcomes update only successful validated payloads and retain the existing app status for rejected/failed outcomes. Run the focused test and confirm failure.

**GREEN:** Refactor `refreshHealth` to use settled promises, check `response.ok` before parsing, classify transport/non-OK/malformed responses separately, and apply only valid health statuses. Capture each checked app's ID plus health target/config identity and verify the current app still exists with the same identity before applying. Keep request-version and abort guards, and preserve activity refresh only after accepted health updates.

**VERIFY:** Run the health helper tests, focused existing tests, `npm test`, and `npm run lint`.

### Task 3: Refactor and commit issue 64

Review the diff for API/security invariants, ensure no `/api/health` route behavior or timeout is weakened, run the focused tests again, and commit the issue-specific changes as:

```bash
git add .hermes/plans/2026-09-02_133321-issue-64-client-health-contract.md app/page.tsx lib/health-client.ts lib/health-client.test.ts
git commit -m "fix: validate client health responses"
```
