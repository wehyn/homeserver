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

export SMOKE_PROJECT="nimbus-release-smoke-$(date +%s%N)"
export SMOKE_PORT=10001
export NIMBUS_BIND_ADDRESS=127.0.0.1
export NIMBUS_PORT=$SMOKE_PORT
export SMOKE_URL=http://$NIMBUS_BIND_ADDRESS:$NIMBUS_PORT

case "$SMOKE_PROJECT" in
  nimbus-release-smoke-*) : ;;
  *) echo "SMOKE_PROJECT must use the nimbus-release-smoke- prefix" >&2; exit 1 ;;
esac

test -d "$HOME/services"
docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" config --quiet

existing_containers="$(docker ps -aq --filter "label=com.docker.compose.project=$SMOKE_PROJECT")"
existing_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$SMOKE_PROJECT")"
existing_networks="$(docker network ls -q --filter "label=com.docker.compose.project=$SMOKE_PROJECT")"
if [ -n "$existing_containers" ] || [ -n "$existing_volumes" ] || [ -n "$existing_networks" ]; then
  echo "SMOKE_PROJECT already owns Docker resources; choose a new project name" >&2
  exit 1
fi

smoke_dir="$(mktemp -d "${TMPDIR:-/tmp}/nimbus-release-smoke.XXXXXX")"
compose_config="$smoke_dir/compose.yaml"
apps_json="$smoke_dir/apps.json"
overview_json="$smoke_dir/overview.json"
save_json="$smoke_dir/save.json"
apps_after_restart_json="$smoke_dir/apps-after-restart.json"

cleanup() {
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" logs --no-color || true
  fi
  docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" down --volumes --remove-orphans || true
  rm -rf -- "$smoke_dir"
  exit "$exit_code"
}
trap cleanup EXIT
docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" config > "$compose_config"
test -s "$compose_config"
grep -Fq "DATABASE_PATH: /app/data/nimbus.db" "$compose_config"
grep -Fq "nimbus-data:" "$compose_config"
docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" up -d --build

ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$SMOKE_URL/api/apps" > "$apps_json"; then
    ready=true
    break
  fi
  sleep 2
done
test "$ready" = true
test -s "$apps_json"

curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$SMOKE_URL/manifest.webmanifest" > /dev/null
curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$SMOKE_URL/sw.js" > /dev/null
curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$SMOKE_URL/api/overview" > "$overview_json"

APPS_JSON="$apps_json" node --input-type=module -e 'import { readFileSync } from "node:fs"; const data = JSON.parse(readFileSync(process.env.APPS_JSON, "utf8")); if (!Array.isArray(data.apps) || data.apps.length !== 8) process.exit(1);'

curl --fail --silent --show-error --connect-timeout 2 --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"id":"release-smoke","name":"Release Smoke","description":"Temporary release verification","category":"Other","url":"https://example.invalid","color":"#65e6a5","status":"unknown","source":"manual","isVisible":true,"sortOrder":999}' \
  "$SMOKE_URL/api/apps" > "$save_json"

docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" down --remove-orphans
docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" up -d

ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$SMOKE_URL/api/apps" > "$apps_after_restart_json"; then
    ready=true
    break
  fi
  sleep 2
done
test "$ready" = true
test -s "$apps_after_restart_json"
APPS_JSON="$apps_after_restart_json" node --input-type=module -e 'import { readFileSync } from "node:fs"; const data = JSON.parse(readFileSync(process.env.APPS_JSON, "utf8")); if (!data.apps.some((app) => app.id === "release-smoke")) process.exit(1);'

agent_container="$(docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" ps -q metrics-agent)"
test -n "$agent_container"
if ! mounts="$(docker inspect "$agent_container" --format '{{json .Mounts}}')"; then
  echo "could not inspect the metrics-agent container" >&2
  exit 1
fi
case "$mounts" in
  *"/var/run/docker.sock"*)
    echo "default Compose unexpectedly mounted the Docker socket" >&2
    exit 1
    ;;
esac
```

The project identifier uses Linux nanosecond time and is checked for existing Compose-labeled
containers, volumes, and networks before the cleanup trap is installed. The `EXIT` trap logs
failures, runs `down --volumes --remove-orphans`, and removes the private `mktemp` output directory.
Every default-stack command names `docker-compose.yml` explicitly, so an ambient `COMPOSE_FILE`
cannot redirect the smoke run to another topology. The rendered configuration is checked for the
expected database path and named data volume before startup. This cleanup is safe for release smoke
validation because the project name is validated to use the unique `nimbus-release-smoke-` prefix
and the smoke stack owns its throwaway resources. It is deliberately project-scoped and must not be
adapted to target a production project. Readiness and route requests use short connect and maximum
time limits so a hung service cannot leave an individual `curl` blocked indefinitely.

## Optional Docker-socket review

The default stack must remain socket-free. If Docker discovery itself needs review, run the
following from the repository root to render the default and optional Compose files with an
operator-supplied socket path, without committing that path or executing the override automatically:

```bash
DOCKER_SOCKET=/var/run/docker.sock \
  docker compose -f docker-compose.yml -f docker-compose.docker.yml config
```

Inspect the rendered `metrics-agent` mounts and require the `/var/run/docker.sock` mount to have
`read_only: true`. A read-only Docker socket is still a powerful host-control interface; a human
reviewer must explicitly accept that risk before the optional override is run. Do not expose raw
Docker socket operations through browser-facing routes.
