# Nimbus

Nimbus is a local-first dashboard for launching and monitoring the web apps hosted on your home
server. It keeps service links, health status, and basic system metrics in one place.

![Nimbus dashboard](public/nimbus-dashboard.png)

## Features

- App registry with launch links, categories, icons, and optional health checks
- CPU, memory, storage, and uptime overview
- Automatic service-health refresh and recent activity
- SQLite persistence with optional Docker/Compose discovery

## Run locally

Node.js 24+ is required for the built-in `node:sqlite` API.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then use **Add application** to register a
service.

## Run with Docker Compose

```bash
docker compose up -d --build
```

The SQLite database is stored in the persistent `nimbus-data` volume. Keep Nimbus behind a trusted
LAN, VPN, or reverse proxy before exposing it outside your home network.
