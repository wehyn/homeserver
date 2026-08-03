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

The Compose deployment also starts a read-only host metrics agent for the Memory and Processor pages
and the Overview hardware cards. It reads Linux process information through `/proc`, user names
through `/etc/passwd`, and CPU thermal/power data through read-only sysfs mounts; none of these
mounts is writable, the agent publishes no host port, and it does not require the Docker socket.
The agent runs as container UID 0 only because Intel RAPL's `energy_uj` counter is root-readable
on some hosts; it is not a privileged container, and all hardware mounts remain read-only.
Set `MEMORY_AGENT_TOKEN` in `.env` to add a shared bearer token between Nimbus and the agent. The
Overview refreshes aggregate CPU, RAM, storage, temperature, and CPU-package power every 5 seconds;
the Memory and Processor pages poll the agent only while they are open. CPU power is an Intel RAPL
package estimate when supported, not a whole-device wall-power measurement.

## Connecting an app

Use **Add application** in the dashboard. Each app can have a launch URL, category, icon URL, and optional health URL. Leave the icon URL blank and Nimbus will try the app's `/favicon.ico`, including when the app is served from a Docker container. If the app is identified as Crafty Controller and its local favicon cannot be loaded, Nimbus uses the Crafty project logo as a fallback. For a trusted private service that uses a self-signed HTTPS certificate, enable **Allow self-signed TLS** in that app's settings; this permits Nimbus to proxy the app favicon as well as perform its server-side health check, and is disabled by default. The registry is stored in SQLite on the server. Docker Compose label discovery is reserved for the next integration pass; the socket mount is commented in `docker-compose.yml` until that is enabled.
