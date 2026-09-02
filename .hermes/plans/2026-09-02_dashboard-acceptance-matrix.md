# Dashboard Issue Acceptance Matrix

Base: `2c0c30ea21f328687cee1e337870141f3d7b4f03`
Branch: `feat/dashboard-github-issues`

| Issue | Implementation | Verification evidence |
|---|---|---|
| #61 | `app/modal-focus.tsx`, `app/launcher/settings-panel.tsx`, `app/system-details-modal.tsx`, `app/page.tsx` | `lib/remaining-accessibility.test.ts`; `tests/dashboard.spec.ts` modal focus test |
| #62 | `app/launcher/settings-panel.tsx` | `lib/remaining-accessibility.test.ts`; browser form semantics test |
| #63 | `app/api/icon/route.ts`, `lib/icon-validation.ts` | `lib/icon-validation.test.ts`; icon proxy security test |
| #64 | `lib/health-client.ts`, `app/page.tsx` | `lib/health-client.test.ts`; mocked health browser test |
| #65 | `lib/health-results.ts`, `app/page.tsx` | `lib/health-results.test.ts` |
| #66 | `app/page.tsx` state/ref boundaries | source review and mocked dashboard browser flow |
| #67 | `lib/icon-sources.ts`, `app/launcher/icons.tsx` | `lib/icon-sources.test.ts`, `lib/launcher-derivations.test.ts` |
| #68 | `public/sw.template.js`, `scripts/generate-sw.mjs`, `public/sw.js`, `app/pwa-register.tsx` | `lib/pwa-assets.test.ts`; service-worker browser test |
| #70 | `app/globals.css`, `app/launcher/settings-panel.tsx` | `lib/responsive-layout.test.ts`; 320/390px browser test |
| #71 | `app/system-details-modal.tsx`, `lib/system-details-accessibility.ts` | `lib/system-details-accessibility.test.ts`; process sorting browser test |
| #72 | `app/metrics-history-chart.tsx`, `lib/metrics-chart.ts` | `lib/metrics-chart.test.ts`; metrics browser test |
| #73 | `app/page.tsx`, `app/system-details-modal.tsx`, `app/launcher/launcher-components.tsx` | `lib/remaining-accessibility.test.ts`; refresh-status browser test |
| #74 | `app/launcher/settings-panel.tsx` | form synchronization implementation and browser edit-switch test |
| #75 | `app/launcher/launcher-components.tsx`, `lib/icon-sources.ts` | `lib/launcher-derivations.test.ts` |
| #76 | `app/launcher/icons.tsx`, `app/launcher/activity.tsx`, `app/metrics-history-chart.tsx` | `lib/remaining-accessibility.test.ts`; accessibility browser assertions |
| #77 | `tests/dashboard.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` | `npm run test:browser`; CI browser-regression job |
| #78 | `lib/relative-time.ts`, `app/launcher/activity.tsx`, `app/launcher/settings-panel.tsx` | `lib/relative-time.test.ts`; activity browser test |
| #79 | `app/page.tsx`, `public/sw.js` | mocked offline/retry browser test; worker API bypass test |
| #80 | `app/manifest.ts`, `public/icon-maskable-512x512.png` | `lib/pwa-manifest.test.ts`, `lib/pwa-assets.test.ts`; manifest browser test |
| #81 | `app/metrics-history-chart.tsx`, `lib/metrics-chart.ts`, `lib/metrics-history-request.ts` | `lib/metrics-chart.test.ts`, `lib/metrics-history-request.test.ts`; metrics browser test |

## Required verification commands

```text
npm test
npm run lint
npm run build
npm run test:browser
node --check public/sw.js
git diff --check
```

No test file may be deleted, skipped, or weakened to obtain a passing result.
