# Dashboard GitHub Issues Implementation Plan

> **For Hermes:** Use the repository's existing test-driven workflow and keep each logical issue slice independently reviewable.

**Goal:** Finish the open dashboard issues without deleting or weakening existing tests, while integrating only verified work from isolated branches.

**Current context:** Base is `2c0c30e`. Verified issue slices already integrated: metrics/accessibility (#72/#76/#81), process-table accessibility (#71), activity timestamps and responsive Web UI fields (#70/#78), health contract/result application (#64/#65), same-origin/raster icon handling (#63/#67/#75), and PWA metadata/service-worker update strategy (#68/#80). Remaining implementation work is modal containment (#61), semantic form controls (#62), mounted form synchronization (#74), offline/recovery UI (#79), and browser regression coverage (#77).

**Approach:** Preserve all existing tests. Use small pure helpers where possible, add regression tests before production changes, run the focused test red/green cycle, then run the complete Node suite, TypeScript check, production build, and deterministic browser suite. Keep unrelated `.hermes/` session artifacts intact.

## Remaining slices

1. **Modal containment (#61):** centralize focusable-element discovery and guard Tab/Shift+Tab from every focus position; keep Escape scoped to the active dialog and restore the trigger after close. Add a browser-level test for settings and system dialogs and ensure background interaction is blocked by the backdrop/dialog semantics.
2. **Form semantics (#62):** assign stable IDs and explicit labels to every input/select. Replace button-inside-label toggles with native checkbox/switch controls and connect explanatory text with `aria-describedby`. Test names, descriptions, state, and activation.
3. **Form synchronization (#74):** synchronize local form state when the edited app identity changes, without resetting new-app defaults unexpectedly. Add a mounted-prop-change regression test.
4. **Offline recovery (#79):** track browser online/offline events, preserve last successful app/overview data, show an explicit offline status and retry action, and keep API requests uncached. Add deterministic helper/component coverage.
5. **Browser regressions (#77):** add a minimal Playwright fixture suite with mocked dashboard APIs, covering responsive Web UI fields, modal focus/Escape/restoration, health refresh failure handling, and service-worker update behavior. Wire it into CI without credentials or private services.

## Validation

- `npm test`
- `npm run lint`
- `npm run build`
- `node --check public/sw.js`
- `npx playwright test` (with the checked-in deterministic fixture)
- `git diff --check`
- Inspect final diff and verify no test files were deleted, skipped, or weakened.
