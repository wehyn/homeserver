# Security

Nimbus is intended for a trusted home LAN or VPN. Do not expose it directly to the public internet
without authentication, authorization, rate limiting, and a reviewed reverse-proxy configuration.

## Secrets and local data

- Keep runtime secrets and machine-specific values in `.env`.
- `.env*` is ignored except for `.env.example`.
- Never commit credentials, private keys, tokens, private URLs, or production database files.
- Keep SQLite data under the configured `DATABASE_PATH`; local `data/` files are runtime artifacts.
- Preserve the existing database schema and data when making changes.

## Health checks and SSRF

`/api/health` makes bounded server-side requests to configured service URLs. Treat these URLs as an
SSRF boundary:

- Accept only the intended HTTP(S) protocols.
- Preserve the existing request timeout of 4.5 seconds.
- Validate and constrain allowed destinations before exposing the endpoint beyond a trusted LAN.
- Do not allow arbitrary browser-supplied URLs to become unrestricted server-side fetches.
- Add authentication and rate limiting before internet-facing deployment.

The icon route also makes bounded requests to configured service URLs and must receive the same
security review when its behavior changes.

## Docker access

`DOCKER_SOCKET` is opt-in through `docker-compose.docker.yml`. The default Compose file keeps the
socket mount disabled. A Docker socket grants powerful control over the host and must not be
enabled casually.

Do not expose raw Docker socket operations through browser-facing API routes. Future container
controls should use a narrowly scoped server-side adapter or local agent, require authentication,
validate every operation, and record mutation activity. Any container-control feature requires
human security review before implementation or deployment.

## Privileged operations

Do not add arbitrary shell execution, terminal access, filesystem administration, package
installation, firewall management, or other privileged controls without explicit security review.
Prefer read-only telemetry and narrowly scoped operations.

## Sensors and host telemetry

When diagnosing sensors exposed under `/sys/class`, resolve class symlinks and check read
permissions before concluding that a sensor is absent. Host telemetry should remain read-only and
should not require broad additional permissions.

## Review requirements

Human review is required for changes involving:

- API validation or persistence
- network access or health-check destinations
- authentication or authorization
- container permissions or Docker socket mounts
- deployment configuration
- new privileged endpoints

Dependency scanning, lockfile auditing, vulnerability thresholds, and a project license are not
currently configured. Define those policies before production redistribution.
