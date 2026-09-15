# Testing and verification

## Automated tests

`npm test` runs Node's built-in test runner over `agent/*.test.ts` and `lib/*.test.ts`.
Coverage includes discovery, metrics sampling, URL handling, request validation, database-row
mapping, health-target construction, legacy SQLite compatibility, and short-TTL/concurrency
helpers. `npm run build:agent` separately compiles the optional metrics agent.

`npm run audit` checks the dependency tree at the high/critical advisory threshold and must pass
before release verification.

`npm run lint` runs `tsc --noEmit`. Despite the script name, no ESLint configuration is currently
present.

`npm run build` validates the production Next.js build and standalone output.

Run the standard verification set with:

```bash
npm run audit
npm test
npm run lint
npm run build:agent
npm run build
NODE_ENV=development npm run test:browser
```

The project requires Node.js 24+ because it uses the built-in `node:sqlite` API.

## Integration coverage

The API routes are the main integration boundary:

- `/api/apps`
- `/api/health`
- `/api/overview`
- `/api/activity`
- `/api/processor/processes`
- `/api/memory/processes`

Database compatibility coverage verifies the inert legacy `apps.is_favorite` column remains readable
and is preserved without appearing in API JSON. Activity-retention tests verify the 90-day/1,000-row
policy without changing app or metric data.

Route behavior can be checked with a temporary `DATABASE_PATH` so local application data is not
modified. The browser configuration always launches a fresh development server with an isolated
`.playwright-cli/nimbus-browser-<pid>.db` path and does not reuse an unrelated server. Do not run
browser tests against the default `data/nimbus.db`.

## Browser smoke coverage

Playwright E2E coverage is checked in under `tests/` and runs with `npm run test:browser`. The
fixtures mock operational APIs so UI tests do not contact private services or mutate the local
database. Live route/database checks must use a temporary `DATABASE_PATH`. Check both desktop and
mobile layouts, including:

- launcher loading and service links
- application add, edit, visibility, and delete flows
- settings modal focus, Escape, and focus restoration
- processor and memory detail dialogs
- CPU and memory history charts with 5m, 15m, and 30m range switching
- flat, low-variance, high, changing, empty, loading, error, and one-sample chart fixtures
- chart time labels, latest/low/high values, point details, and the expandable readings table
- stale history responses being aborted or ignored after range changes and refreshes
- history chart layout at desktop width and narrow 390px/320px system-detail modals
- sortable process tables and refresh behavior
- large process fixtures with bounded rows, explicit returned/unreadable/policy-omitted counts,
  bounded agent response validation, and cancellation-aware collection
- service health refresh and error states
- health polling pause/resume on document visibility changes
- activity history
- absence of the removed Favorites control/copy and JSON field
- launcher request-count and no-page-overflow smoke checks at desktop, tablet, and mobile widths

The visibility regression test changes the browser's visibility state explicitly: hidden tabs do not
start another health request, and the next visible transition triggers a refresh.

The performance smoke suite asserts structural boundaries—one initial app request, no unexpected
health fan-out, and no page-level horizontal overflow—rather than machine-specific timing budgets.
Health fan-out is additionally bounded to eight concurrent browser checks, activity reads are
coalesced, and activity refresh coverage distinguishes status transitions from unchanged successful
checks. Docker discovery tests also verify container inspection limits, cancellation, Compose file
caps, and partial-state warnings.
The performance smoke suite does not use `networkidle` because dashboard polling remains active.

The supported deployment smoke check is documented in [docs/release-smoke.md](release-smoke.md). It
must run with a unique throwaway Compose project and volume, never the production project, volume,
or `DATABASE_PATH`.

Process snapshots use a contract-valid fixture with explicit `totalCount`, `returnedCount`,
`unreadableCount`, and `policyOmittedCount`; API validation rejects oversized arrays, inconsistent
counts, overlong strings, and responses above 512 KiB. Agent fixtures also exercise the 1,024-entry
scan bound, 256-row response cap, bounded concurrent reads, and cancellation signal.

Playwright browser tests need Chromium (`npx playwright install --with-deps chromium`). CI sets
Node.js 24 and runs the same isolated development-server configuration.

The domain suite contains legacy-database tests that start temporary Next servers, and the browser suite starts another Next server. Run these commands serially in one worktree: concurrent Next processes can write the shared .next/ directory and produce missing vendor chunks or cross-test database results. CI jobs are isolated and may run in parallel on separate workers.

## Build discipline

Stop any running `next dev` process before `npm run build`; concurrent access to `.next/` can
corrupt development output. Check for a development server started from the user shell as well,
since it may not appear in the agent's process list. Restart it afterward if it was running.

If `node` or `npm` is unavailable in the execution shell, verify the user shell's PATH before
concluding that Node.js is unavailable. The Node 24 Docker environment is the fallback.
