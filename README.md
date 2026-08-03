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

The Compose deployment also starts a read-only host metrics agent for the Memory and Processor pages,
the Overview hardware cards, and optional Docker application checks. It reads Linux process
information through `/proc`, user names through `/etc/passwd`, CPU thermal/power data through
read-only sysfs mounts, and Compose metadata through the read-only `${HOME}/services` mount. The
services tree is scanned for Compose files and optional launch metadata; missing metadata is
reported as unknown rather than inferred. None of these mounts is writable, and the agent publishes
no host port.
The agent runs as container UID 0 only because Intel RAPL's `energy_uj` counter is root-readable
on some hosts; it is not a privileged container, and all hardware mounts remain read-only.
Set `MEMORY_AGENT_TOKEN` in `.env` to add a shared bearer token between Nimbus and the agent. The
Overview refreshes aggregate CPU, RAM, storage, temperature, and CPU-package power every 5 seconds;
the Memory and Processor pages poll the agent only while they are open. CPU power is an Intel RAPL
package estimate when supported, not a whole-device wall-power measurement.

Docker state is disabled by default because access to `/var/run/docker.sock` grants powerful control
over the host. To opt in after a security review, set `DOCKER_SOCKET=/var/run/docker.sock` and start
Compose with the optional override:

```bash
docker compose -f docker-compose.yml -f docker-compose.docker.yml up -d --build
```

The override is the only place that mounts the socket, and the metrics agent is the only component
that accesses it. A read-only bind mount does not reduce Docker API authority, so keep this option
limited to a trusted deployment. Nimbus uses only Docker GET endpoints for container/project state.
Set `MEMORY_AGENT_TOKEN` in `.env` to protect the metrics endpoints and use `DOCKER_AGENT_TOKEN` for a
separate Docker token when desired.

## Connecting an app

Use **Add application** in the dashboard. Each app can have a launch URL, category, icon URL, and optional health URL. Leave the icon URL blank and Nimbus will try the app's `/favicon.ico`, including when the app is served from a Docker container. If the app is identified as Crafty Controller and its local favicon cannot be loaded, Nimbus uses the Crafty project logo as a fallback. For a trusted private service that uses a self-signed HTTPS certificate, enable **Allow self-signed TLS** in that app's settings; this permits Nimbus to proxy the app favicon as well as perform its server-side health check, and is disabled by default.

The registry is stored in SQLite on the server. Docker/Compose state is reconciled into matching
applications without deleting manual records. Service reachability remains a separate signal: HTTP
`200 OK` and `401 Unauthorized` are considered successful health probes, while a running container
with an unavailable web interface is shown as running and offline separately.
