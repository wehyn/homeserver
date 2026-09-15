# Nimbus

Nimbus is a local-first launcher and observability dashboard for self-hosted services. It puts
service links, health status, recent activity, and basic host metrics on one calm, kiosk-friendly
home screen.

> Nimbus is early-stage software (`0.1.0`) for a trusted home LAN or VPN. It does not provide user
> authentication and must not be exposed directly to the public internet.

![Nimbus dashboard](./public/nimbus-dashboard.png)

## What it does

- Launches self-hosted applications with custom icons and local-host URL resolution.
- Refreshes service health and records recent status changes.
- Shows CPU, memory, storage, uptime, temperature, and power telemetry.
- Stores the application registry and history in a local SQLite database.
- Optionally discovers Docker containers and Compose metadata through a read-only agent.
- Provides sortable processor and memory process details.
- Includes responsive layouts, accessible dialogs and forms, and installable PWA metadata.

## Requirements

- Node.js 24 or newer. Nimbus uses Node's built-in `node:sqlite` API.
- npm.
- Docker Engine and the Compose plugin for the container deployment.
- A Linux host for the optional host-process, sysfs, and Docker discovery telemetry. The web
  application itself can run locally on other platforms, but the host metrics mounts are
  Linux-oriented.
- Chromium for the browser regression suite.

## Run locally

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then use the settings control to register a
service. The first database request creates the schema and seeds the default application records
when the database is empty.

Nimbus reads `DATABASE_PATH` when it is set; otherwise local development uses
`data/nimbus.db`. Runtime `.env` files are ignored by Git. Start from the safe example when you
need to configure an agent or database path:

```bash
cp .env.example .env
```

## Run with Docker Compose

The default Compose stack builds the Nimbus web application and its metrics agent, stores SQLite
data in the persistent `nimbus-data` volume, and publishes Nimbus on host port `10000`:

```bash
docker compose up -d --build
```

Open [http://localhost:10000](http://localhost:10000). The default port mapping listens on all host
interfaces, so use a firewall or a local-only port override when appropriate. The metrics agent
reads host process and sensor data through read-only mounts. The default stack does not mount the
Docker socket.

Docker discovery is opt-in because Docker socket access is sensitive. Set `DOCKER_SOCKET` to the
host socket path, then include the optional override:

```bash
DOCKER_SOCKET=/var/run/docker.sock \
  docker compose -f docker-compose.yml -f docker-compose.docker.yml up -d --build
```

When set, `MEMORY_AGENT_TOKEN` protects process and hardware agent requests, while
`DOCKER_AGENT_TOKEN` can protect Docker discovery separately. Use long, locally generated values
when the agent network is not otherwise isolated. The Compose files do not publish the agent port
to the host.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_PATH` | SQLite location; defaults to `data/nimbus.db` locally and `/app/data/nimbus.db` in Compose. |
| `MEMORY_AGENT_TOKEN` | Bearer token shared by Nimbus and the process/hardware agent. |
| `DOCKER_AGENT_TOKEN` | Optional bearer token for Docker discovery; falls back to the memory-agent token. |
| `DOCKER_SOCKET` | Host Docker socket path used only with `docker-compose.docker.yml`. |

Compose supplies the internal agent URLs automatically. Separate-agent deployments can also set
`MEMORY_AGENT_URL`, `HARDWARE_AGENT_URL`, and `DOCKER_AGENT_URL` to the appropriate server URLs.

## Security model

Nimbus is designed for a trusted home LAN or VPN, not as an internet-facing administration console.

- There is no built-in authentication or authorization. Application APIs can read and mutate the
  local registry, and process/Docker views expose sensitive host telemetry.
- Health and icon routes make bounded server-side requests to configured application URLs. Treat
  those URLs as an SSRF boundary and do not accept untrusted application configuration.
- The optional Docker socket grants powerful host access even though Nimbus currently uses a
  read-only discovery path. Enable it only when Docker discovery is needed.
- Environment values discovered from Docker and Compose metadata are redacted before they cross
  the agent/API boundary.
- Put Nimbus behind authentication, authorization, rate limiting, and a reviewed reverse proxy
  before exposing it beyond a trusted LAN or VPN.

See [the security guide](docs/security.md) for the complete threat model and deployment rules.

## Development and verification

```bash
npm test
npm run lint
npm run build:agent
npm run build
NODE_ENV=development npm run test:browser
```

Install Chromium before the browser suite if needed:

```bash
npx playwright install --with-deps chromium
```

The browser configuration uses an isolated temporary database and mocked operational APIs. Stop
any running `next dev` process before `npm run build` so development output cannot interfere with
the production build.

## Project documentation

- [Architecture](docs/architecture.md) — runtime flow, persistence, deployment, and extension points.
- [Security](docs/security.md) — threat model, SSRF boundary, Docker access, and privileged operations.
- [Testing](docs/testing.md) — unit, browser, integration, and build coverage.
- [Contributing](CONTRIBUTING.md) — setup, workflow, validation, and pull-request expectations.

## Project status and license

Nimbus is still evolving toward its first formal open-source release. A project license has not
yet been selected; do not assume that the source may be redistributed until an OSI-approved license
is added.
