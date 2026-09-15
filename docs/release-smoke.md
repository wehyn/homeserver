# Disposable Docker release smoke test

Run this procedure only on a disposable Linux host or in an isolated Docker context. It requires
`$HOME/services`, because the default metrics-agent Compose configuration references that service
root. Never reuse the production Compose project, production volume, or production
`DATABASE_PATH` for release validation.

The procedure creates a unique, throwaway Compose project and uses host loopback port `10001`.
It checks startup readiness, seeded data, application and overview routes, PWA assets, persistence
across a container restart, and the default stack's absence of a Docker socket. Do not execute this
procedure against a production deployment.

## Procedure

Save the following as a shell session on the disposable or isolated host and run it from the
repository root:

```bash
set -euo pipefail

export SMOKE_PROJECT="nimbus-release-smoke-$(date +%s)"
export SMOKE_PORT=10001
export NIMBUS_BIND_ADDRESS=127.0.0.1
export NIMBUS_PORT=$SMOKE_PORT
export SMOKE_URL=http://$NIMBUS_BIND_ADDRESS:$NIMBUS_PORT

case "$SMOKE_PROJECT" in
  nimbus-release-smoke-*) : ;;
  *) echo "SMOKE_PROJECT must use the nimbus-release-smoke- prefix" >&2; exit 1 ;;
esac

cleanup() {
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    docker compose -p "$SMOKE_PROJECT" logs --no-color || true
  fi
  docker compose -p "$SMOKE_PROJECT" down --volumes --remove-orphans || true
  exit "$exit_code"
}
trap cleanup EXIT

test -d "$HOME/services"
docker compose -p "$SMOKE_PROJECT" config --quiet
docker compose -p "$SMOKE_PROJECT" up -d --build

rm -f /tmp/nimbus-smoke-apps.json
ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "$SMOKE_URL/api/apps" > /tmp/nimbus-smoke-apps.json; then
    ready=true
    break
  fi
  sleep 2
done
test "$ready" = true
test -s /tmp/nimbus-smoke-apps.json

curl --fail --silent --show-error "$SMOKE_URL/manifest.webmanifest" > /dev/null
curl --fail --silent --show-error "$SMOKE_URL/sw.js" > /dev/null
curl --fail --silent --show-error "$SMOKE_URL/api/overview" > /tmp/nimbus-smoke-overview.json

node --input-type=module -e 'import { readFileSync } from "node:fs"; const data = JSON.parse(readFileSync("/tmp/nimbus-smoke-apps.json", "utf8")); if (!Array.isArray(data.apps) || data.apps.length !== 8) process.exit(1);'

curl --fail --silent --show-error \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"id":"release-smoke","name":"Release Smoke","description":"Temporary release verification","category":"Other","url":"https://example.invalid","color":"#65e6a5","status":"unknown","source":"manual","isVisible":true,"sortOrder":999}' \
  "$SMOKE_URL/api/apps" > /tmp/nimbus-smoke-save.json

docker compose -p "$SMOKE_PROJECT" down --remove-orphans
docker compose -p "$SMOKE_PROJECT" up -d

rm -f /tmp/nimbus-smoke-apps-after-restart.json
ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "$SMOKE_URL/api/apps" > /tmp/nimbus-smoke-apps-after-restart.json; then
    ready=true
    break
  fi
  sleep 2
done
test "$ready" = true
test -s /tmp/nimbus-smoke-apps-after-restart.json
node --input-type=module -e 'import { readFileSync } from "node:fs"; const data = JSON.parse(readFileSync("/tmp/nimbus-smoke-apps-after-restart.json", "utf8")); if (!data.apps.some((app) => app.id === "release-smoke")) process.exit(1);'

agent_container="$(docker compose -p "$SMOKE_PROJECT" ps -q metrics-agent)"
if docker inspect "$agent_container" --format '{{json .Mounts}}' | rg -q '/var/run/docker.sock'; then
  echo "default Compose unexpectedly mounted the Docker socket" >&2
  exit 1
fi
```

The `EXIT` trap logs failures and runs `down --volumes --remove-orphans`. This cleanup is safe for
release smoke validation because the project name is validated to use the unique
`nimbus-release-smoke-` prefix and the smoke stack owns its throwaway volume. It is deliberately
project-scoped and must not be adapted to target a production project.

## Optional Docker-socket review

The default stack must remain socket-free. If Docker discovery itself needs review, render the
default and optional Compose files with an operator-supplied socket path, without committing that
path or executing the override automatically:

```bash
DOCKER_SOCKET=/var/run/docker.sock \
  docker compose -p "$SMOKE_PROJECT" -f docker-compose.yml -f docker-compose.docker.yml config
```

Inspect the rendered `metrics-agent` mounts and require the `/var/run/docker.sock` mount to have
`read_only: true`. A read-only Docker socket is still a powerful host-control interface; a human
reviewer must explicitly accept that risk before the optional override is run. Do not expose raw
Docker socket operations through browser-facing routes.
