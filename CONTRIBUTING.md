# Contributing to Nimbus

Thanks for helping improve Nimbus. It is a local-first home-server dashboard, so contributions
should keep the interface calm, the runtime bounded, and the host security model explicit.

## Before you start

Please read:

- [`AGENTS.md`](AGENTS.md) for repository conventions and safety boundaries.
- [`docs/architecture.md`](docs/architecture.md) for the runtime structure and persistence rules.
- [`docs/security.md`](docs/security.md) for SSRF, Docker, telemetry, and deployment constraints.
- [`docs/dependency-policy.md`](docs/dependency-policy.md) for lockfile and dependency-audit requirements.
- [`docs/testing.md`](docs/testing.md) for the complete verification matrix.

For a bug or feature that changes behavior, open an issue first when practical. Small, focused fixes
can go directly into a pull request with a clear explanation of the problem and the chosen scope.

## Local setup

Nimbus requires Node.js 24 or newer:

```bash
npm ci
npm run dev
```

Use a local `.env` for machine-specific settings. Do not commit credentials, tokens, private URLs,
database files, or host-specific configuration. Browser tests need Chromium:

```bash
npx playwright install --with-deps chromium
```

## Development guidelines

- Use strict TypeScript and React components in `.tsx` files.
- Keep UI in `app/`, API handlers in `app/api/**/route.ts`, and reusable server/domain logic in
  `lib/`.
- Keep `lib/db.ts` server-only and preserve `DATABASE_PATH` and SQLite compatibility.
- Validate API input before persistence and keep responses JSON-shaped.
- Keep telemetry inside the resource it describes; do not add unrelated dashboard sections for a
  focused visual change.
- Preserve the trusted-LAN/VPN threat model. Do not add arbitrary shell execution, terminal access,
  filesystem administration, or browser-facing Docker control without explicit security review.
- Treat configured health and icon URLs as SSRF-sensitive. Preserve bounded timeouts and destination
  validation when changing those routes.
- Do not weaken or delete tests to make a change pass. Add regression coverage for behavior changes.
- Keep public documentation synchronized with implementation and deployment behavior.

## Branches and commits

Create a focused branch from `main`, using names such as:

```text
feat/<short-topic>
fix/<short-topic>
docs/<short-topic>
```

Prefer one coherent change per commit. Use imperative, descriptive commit messages such as:

```text
fix: reject stale health status writes
docs: clarify Docker deployment requirements
```

## Verification

Run the checks relevant to the files you changed. For TypeScript, runtime, API, or deployment
changes, run the complete set:

```bash
npm test
npm run audit
npm run lint
npm run build:agent
npm run build
NODE_ENV=development npm run test:browser
git diff --check
```

The browser suite owns its own isolated development server and database. Do not run it against a
live server or the default `data/nimbus.db`. Stop any running `next dev` process before building,
and verify the real exit status of long-running commands before opening a pull request.

## Pull requests

A pull request should include:

- A concise summary of the user-visible or operational change.
- The relevant tests and commands that actually passed.
- Security and migration notes for network, authentication, Docker, persistence, or deployment
  changes.
- Screenshots or a short recording for meaningful UI changes.
- Documentation updates when setup, configuration, threat model, or behavior changes.

Keep unrelated worktree changes out of the pull request. Review the staged diff and `git diff --check`
before committing.

## Reporting security issues

Please do not publish credentials or exploit details in a public issue. Contact the repository owner
privately through GitHub with the affected version, deployment mode, reproduction steps, and impact.
