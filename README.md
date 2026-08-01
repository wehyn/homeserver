# Nimbus

Nimbus is a local-first dashboard for launching and keeping an eye on the web apps hosted by your home server.

## Run locally

This project uses Node 24+ because persistence uses the built-in `node:sqlite` API.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy with Docker Compose

```bash
docker compose up -d --build
```

The SQLite database is stored in the `nimbus-data` volume. To expose Nimbus safely outside your LAN, put it behind the reverse proxy or VPN you already use for your other services.

The Compose deployment also starts a read-only host metrics agent for the Memory and Processor pages. It reads
Linux process information through `/proc` and user names through `/etc/passwd`; neither mount is
writable, the agent publishes no host port, and it does not require the Docker socket. Set
`MEMORY_AGENT_TOKEN` in `.env` to add a shared bearer token between Nimbus and the agent. The
Memory and Processor pages poll the agent only while they are open.

### Optional Docker discovery

Nimbus exposes `GET /api/docker` and the metrics agent exposes the corresponding
`GET /v1/docker/containers` endpoint. Discovery is disabled honestly until
`DOCKER_DISCOVERY_URL` points to a separately deployed, authenticated read-only Docker API
adapter. The adapter must permit only the Docker Engine read operations needed by the agent:

- `GET /containers/json?all=true`
- `GET /containers/{id}/json`
- `GET /containers/{id}/stats?stream=false` for running containers

The agent normalizes container IDs and names, images, Compose project/service labels, state,
health, ports, timestamps, and optional resource usage into a stable response envelope. If the
adapter is missing or unreachable, `/api/docker` returns HTTP 503 with `available: false`, an empty
container list, and a warning; it never fabricates container data. The Compose file intentionally
does not mount `/var/run/docker.sock` into Nimbus or the metrics agent. Keep the adapter on the
trusted host network, restrict it to these GET routes, and protect it with
`DOCKER_DISCOVERY_TOKEN`.

## Operations, telemetry, and alerts

The dashboard records health status transitions and latency observations for each service. Open
**Details** on an application for status history, latency, availability/uptime coverage,
dependencies, container state, and last-backup metadata. These records are additive SQLite tables;
Nimbus does not run backups or infer backup success.

Open **Host telemetry** for temperatures, network counters, software RAID state, disk state, UPS
capability, and Docker resource history. Hardware capabilities that are not safely available from
the read-only agent are shown as unavailable rather than guessed. The view also remains useful
when only the host agent or Docker adapter is available.

Nimbus is installable as a small mobile PWA. Enable browser outage alerts from the bell menu to
receive notifications for meaningful outages and recoveries; the first result and repeated polls
are intentionally quiet. Optional server-side delivery can be configured with
`NIMBUS_NOTIFICATION_WEBHOOK_URL`. This target is server-side configuration and is never supplied
by the browser. Server delivery occurs when Nimbus records a health transition; for alerts while
the dashboard is closed, use an external scheduler or monitor to invoke the health checks.

### Configuration without `.env`

`.env` is only a Compose convenience. You can export the same variables in the shell before
running Compose, pass another file with `docker compose --env-file /path/to/config.env`, or use
your service manager's environment/secrets mechanism. Docker Compose does not automatically expose
mounted secret files as environment variables, so the current image expects these settings through
the environment unless you add a small secret-reading wrapper.

## Connecting an app

Use **Add application** in the dashboard. Each app can have a launch URL, category, icon URL, and optional health URL. For a trusted private service that uses a self-signed HTTPS certificate, enable **Allow self-signed TLS** in that app's settings; this only affects its server-side health check and is disabled by default. The registry is stored in SQLite on the server. Docker discovery is a separate read-only API contract and does not automatically create or modify managed applications; map containers to services with the `com.nimbus.app-id` label when you want container state and resource history attached to a service.
