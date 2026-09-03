# Server-Side Health Persistence Race Fix Plan

> **For Hermes:** Implement this plan task-by-task with strict TDD. Preserve all existing tests and keep the fix scoped to stale health-result persistence.

**Goal:** Prevent an in-flight health check from writing a result to a deleted, recreated, or reconfigured application record.

**Context:** `app/page.tsx` correctly ignores stale client results, but `/api/health` currently captures an app before awaiting the external service and then calls `updateAppStatus(id, status)` unconditionally. The server must validate the record identity and health configuration again before persisting.

**Approach:** Capture the SQLite row identity, a persisted per-record generation token, resolved health target, and TLS mode before the network await. Before writing, reload the row and require the same row identity/generation and health configuration. A delete/recreate receives a new generation token; editing the target or TLS/configuration invalidates the old result. Apply the final write with the same snapshot predicates in the SQL `WHERE` clause so a configuration change between validation and update is also rejected. Name-only edits remain valid because the health result still applies to the same target.

## Steps

1. Add a focused unit test for the snapshot predicate covering delete/recreate, target changes, TLS changes, and a valid unchanged configuration. Run it first and confirm it fails because the predicate is not implemented.
2. Add the pure snapshot predicate and its types in `lib/health-persistence.ts`.
3. Add database helpers in `lib/db.ts` to capture the row identity and atomically revalidate before status persistence.
4. Update `app/api/health/route.ts` to use the snapshot-aware lookup and update path for both successful and failed external checks.
5. Run the focused regression test, then the full unit suite, lint, build, browser tests, service-worker syntax check, and diff check.
6. Commit the remediation separately, push PR #82, and obtain a fresh independent review of the new exact head.

## Files

- Create: `lib/health-persistence.ts`
- Create: `lib/health-persistence.test.ts`
- Modify: `lib/db.ts`
- Modify: `app/api/health/route.ts`

## Acceptance

- No stale health result is persisted after delete/recreate or health-target/TLS changes.
- A result for the same database row and same health configuration still persists.
- Both online/degraded and offline failure paths use the guard.
- Existing tests remain unchanged and all checks pass.
- Existing rows are backfilled with a persisted generation token, and updates preserve it unless a row is recreated.
