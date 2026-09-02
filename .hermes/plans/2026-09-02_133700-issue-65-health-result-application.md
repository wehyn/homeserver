# Issue 65 Health Result Application Plan

> **For Hermes:** Execute this plan with strict RED-GREEN-REFACTOR TDD.

**Goal:** Apply health refresh results in linear time while preserving application and array identity for no-op and stale updates.

**Architecture:** Move result application into a pure `lib/health-results.ts` helper. Build one `Map` keyed by app ID, verify the captured health configuration identity before updating, and return the original array when no status changes are applicable. Keep request/failure classification in `lib/health-client.ts` and orchestration in `app/page.tsx`.

**Tech Stack:** TypeScript, Node built-in test runner, React client component.

---

### Task 1: Add failing identity-preserving result-application tests

**Files:**
- Create: `lib/health-results.test.ts`
- Modify: `lib/health-results.ts` only after RED

**RED:** Test that a no-op result returns the same apps array and app objects, a changed valid status only replaces the matching app, a missing/deleted app is ignored, and a result captured for an old health target is ignored.

Run: `node --experimental-strip-types --test lib/health-results.test.ts`
Expected: FAIL because the helper does not exist.

### Task 2: Implement the single-map application helper

**Files:**
- Create: `lib/health-results.ts`
- Modify: `app/page.tsx`

**GREEN:** Implement `applyHealthResults` with one `Map`, configuration identity checks, and copy-on-change semantics. Replace the inline result scan in `refreshHealth` with the helper and keep refresh activity conditional on applicable valid results.

Run: `node --experimental-strip-types --test lib/health-results.test.ts` and verify PASS.

### Task 3: Refactor and commit issue 65

Run `npm test` and `npm run lint`, review that no status/failure behavior regressed, then commit only issue-65 files and its plan:

```bash
git add .hermes/plans/2026-09-02_133700-issue-65-health-result-application.md app/page.tsx lib/health-results.ts lib/health-results.test.ts
 git commit -m "perf: avoid redundant health state updates"
```
