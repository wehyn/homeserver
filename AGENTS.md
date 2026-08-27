# Agent instructions

## Project rules

- Use TypeScript with strict compiler checking and React components in `.tsx` files.
- Follow the existing Next.js App Router structure: UI in `app/`, API handlers in
  `app/api/**/route.ts`, and reusable server/domain code in `lib/`.
- Use the `@/*` import alias for repository-root imports.
- Keep server-only database code isolated from client components. `lib/db.ts` must remain
  server-only.
- Match the existing concise functional-component style, double-quoted imports, semicolons,
  and two-space indentation.
- Use `camelCase` for variables, functions, and TypeScript fields; `PascalCase` for React
  components and types; and `SCREAMING_SNAKE_CASE` only for true constants.
- Use kebab-case for URL paths and route identifiers.
- Keep API responses JSON-shaped and validate required request fields before database writes.
- Keep related system telemetry inside its primary resource card. For example, CPU temperature
  and CPU power belong inside the Processor card.
- Preserve the existing visual language. Use Manrope for application-card status text and DM Mono
  for compact metadata and telemetry.

## Safety boundaries

- Do not edit generated or runtime artifacts: `.next/`, `node_modules/`, SQLite files under
  `data/`, or `tsconfig.tsbuildinfo`.
- Never add credentials, local hostnames, private URLs, tokens, or secrets to tracked files,
  fixtures, or `.env.example`.
- Preserve `DATABASE_PATH` behavior and SQLite schema compatibility. Database schema changes
  require an explicit migration plan; never silently delete or recreate user data.
- Do not enable Docker socket access, broaden health-check network access, or expose privileged
  endpoints without explicit human security review.
- Treat `/api/health` as an SSRF boundary. Preserve its HTTP(S) validation and bounded timeout.
- Do not expose raw Docker socket operations through browser-facing routes. Use a narrowly scoped
  server-side adapter or agent for future container controls.
- Do not add arbitrary shell execution, terminal access, or filesystem administration features
  without explicit security review.
- When diagnosing sysfs sensors under `/sys/class`, resolve class symlinks and check read
  permissions before concluding that a sensor is absent.
- When changing a visual background effect, inspect both the CSS declarations and JSX elements
  that render it.
- For visual requests, keep changes limited to the named component or scope; do not add
  dashboard-wide sections or navigation without confirmation.
- When simplifying application cards, remove technical linkage labels and verbose WebUI status
  copy unless explicitly requested.

## Verification

- For TypeScript or runtime-affecting changes, run `npm test`, `npm run lint`, and `npm run build`.
- Stop any running `next dev` server before `npm run build`, including one started outside the
  agent shell, then restart it afterward if it was running.
- Browser smoke coverage should include desktop and mobile launcher layouts, theme switching,
  application management, add/edit/delete flows, modal focus and Escape behavior, system detail
  dialogs, and health refresh.
- If `node` or `npm` cannot be resolved, check the user shell PATH before treating Node.js as
  unavailable. The project requires Node.js 24+ for the built-in `node:sqlite` API; Docker is the
  fallback environment.

## Documentation

- Architecture, testing, and security details live in:
  - [`docs/architecture.md`](docs/architecture.md)
  - [`docs/testing.md`](docs/testing.md)
  - [`docs/security.md`](docs/security.md)
- Keep these documents synchronized with implementation changes.
- No feature-flag system, plugin loader, or documented event hook currently exists. Define a
  convention before adding runtime extensibility.
