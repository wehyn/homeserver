# Testing and verification

## Automated tests

`npm test` runs Node's built-in test runner over `agent/*.test.ts` and `lib/*.test.ts`.
Coverage includes discovery, metrics sampling, URL handling, request validation, database-row
mapping, and health-target construction.

`npm run lint` runs `tsc --noEmit`. Despite the script name, no ESLint configuration is currently
present.

`npm run build` validates the production Next.js build and standalone output.

Run the standard verification set with:

```bash
npm test
npm run lint
npm run build
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

Route behavior can be checked with a temporary `DATABASE_PATH` so local application data is not
modified.

## Browser smoke coverage

No browser E2E suite is checked in. Use the Playwright CLI against `http://localhost:3000` for
manual or scripted smoke coverage. Check both desktop and mobile layouts, including:

- launcher loading and service links
- theme switching
- application add, edit, visibility, and delete flows
- settings modal focus, Escape, and focus restoration
- processor and memory detail dialogs
- CPU and memory history charts with 5m, 15m, and 30m range switching
- flat, low-variance, high, changing, empty, loading, error, and one-sample chart fixtures
- chart time labels, latest/low/high values, point details, and the expandable readings table
- stale history responses being aborted or ignored after range changes and refreshes
- history chart layout at desktop width and narrow 390px/320px system-detail modals
- sortable process tables and refresh behavior
- service health refresh and error states
- activity history

## Build discipline

Stop any running `next dev` process before `npm run build`; concurrent access to `.next/` can
corrupt development output. Check for a development server started from the user shell as well,
since it may not appear in the agent's process list. Restart it afterward if it was running.

If `node` or `npm` is unavailable in the execution shell, verify the user shell's PATH before
concluding that Node.js is unavailable. The Node 24 Docker environment is the fallback.
