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

The Compose deployment also starts a read-only host metrics agent for the Memory page. It reads
Linux process information through `/proc` and user names through `/etc/passwd`; neither mount is
writable, the agent publishes no host port, and it does not require the Docker socket. Set
`MEMORY_AGENT_TOKEN` in `.env` to add a shared bearer token between Nimbus and the agent. The
Memory page polls the agent only while it is open.

## Connecting an app

Use **Add application** in the dashboard. Each app can have a launch URL, category, icon URL, and optional health URL. The registry is stored in SQLite on the server. Docker Compose label discovery is reserved for the next integration pass; the socket mount is commented in `docker-compose.yml` until that is enabled.
