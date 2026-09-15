import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("release smoke documentation is isolated, persistent, and socket-aware", () => {
  const smoke = readFileSync(join(root, "docs/release-smoke.md"), "utf8");
  assert.match(smoke, /nimbus-release-smoke-/);
  assert.match(smoke, /export SMOKE_PROJECT="nimbus-release-smoke-\$\(date \+%s%N\)"/);
  assert.match(smoke, /test -d "\$HOME\/services"/);
  assert.match(smoke, /NIMBUS_BIND_ADDRESS/);
  assert.match(smoke, /NIMBUS_PORT/);
  assert.match(smoke, /export SMOKE_PORT=10001/);
  assert.match(smoke, /export NIMBUS_BIND_ADDRESS=127\.0\.0\.1/);
  assert.match(smoke, /\/api\/apps/);
  assert.match(smoke, /\/api\/overview/);
  assert.match(smoke, /manifest\.webmanifest/);
  assert.match(smoke, /sw\.js/);
  assert.match(smoke, /data\.apps\.length !== 8/);
  assert.match(smoke, /--data '\{"id":"release-smoke"/);
  assert.match(smoke, /docker compose -p "\$SMOKE_PROJECT" down --remove-orphans/);
  assert.match(smoke, /docker compose -p "\$SMOKE_PROJECT" up -d/);
  assert.match(smoke, /--volumes --remove-orphans/);
  assert.match(smoke, /docker ps -aq --filter "label=com\.docker\.compose\.project=\$SMOKE_PROJECT"/);
  assert.match(smoke, /docker volume ls -q --filter "label=com\.docker\.compose\.project=\$SMOKE_PROJECT"/);
  assert.match(smoke, /var\/run\/docker\.sock/);
  assert.match(smoke, /docker inspect "\$agent_container" --format/);
  assert.match(smoke, /read_only: true/);
  assert.match(smoke, /a human\s+reviewer must explicitly accept/);
  assert.doesNotMatch(smoke, /docker compose -p "\$SMOKE_PROJECT" -f docker-compose\.yml -f docker-compose\.docker\.yml config/);
  assert.match(smoke, /example\.invalid/);
});
