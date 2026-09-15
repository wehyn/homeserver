import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("release smoke documentation is isolated, persistent, and socket-aware", () => {
  const smoke = readFileSync(join(root, "docs/release-smoke.md"), "utf8");
  const codeBlocks = [...smoke.matchAll(/```bash\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(codeBlocks.length, 2);

  const script = codeBlocks[0];
  const optionalScript = codeBlocks[1];
  const assertScriptOrder = (...fragments: string[]) => {
    let previousIndex = -1;
    for (const fragment of fragments) {
      const index = script.indexOf(fragment);
      assert.notEqual(index, -1, `Missing runbook fragment: ${fragment}`);
      assert.ok(index > previousIndex, `Runbook fragment is out of order: ${fragment}`);
      previousIndex = index;
    }
  };

  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /export SMOKE_PROJECT="nimbus-release-smoke-\$\(date \+%s%N\)"/);
  assert.match(script, /test -d "\$HOME\/services"/);
  assert.match(script, /export SMOKE_PORT=10001/);
  assert.match(script, /export NIMBUS_BIND_ADDRESS=127\.0\.0\.1/);
  assert.match(script, /export NIMBUS_PORT=\$SMOKE_PORT/);
  assert.match(script, /curl --fail --silent --show-error "\$SMOKE_URL\/api\/apps"/);
  assert.match(script, /curl --fail --silent --show-error "\$SMOKE_URL\/api\/overview"/);
  assert.match(script, /manifest\.webmanifest/);
  assert.match(script, /sw\.js/);
  assert.match(script, /data\.apps\.length !== 8/);
  assert.match(script, /-X POST/);
  assert.match(script, /--data '\{"id":"release-smoke"/);
  assert.match(script, /example\.invalid/);
  assert.match(script, /test -n "\$agent_container"/);
  assert.match(script, /docker ps -aq --filter "label=com\.docker\.compose\.project=\$SMOKE_PROJECT"/);
  assert.match(script, /docker volume ls -q --filter "label=com\.docker\.compose\.project=\$SMOKE_PROJECT"/);
  assert.match(script, /docker network ls -q --filter "label=com\.docker\.compose\.project=\$SMOKE_PROJECT"/);
  assert.match(script, /--volumes --remove-orphans/);
  assert.match(script, /var\/run\/docker\.sock/);
  assert.match(smoke, /read_only: true/);
  assert.match(smoke, /a human\s+reviewer must explicitly accept/);

  assertScriptOrder(
    'test -d "$HOME/services"',
    'docker compose -p "$SMOKE_PROJECT" config --quiet',
    "existing_containers=",
    "existing_volumes=",
    "existing_networks=",
    "cleanup() {",
    "trap cleanup EXIT",
    'docker compose -p "$SMOKE_PROJECT" up -d --build',
    "  -X POST \\\n",
    'docker compose -p "$SMOKE_PROJECT" down --remove-orphans',
    'docker compose -p "$SMOKE_PROJECT" up -d\n\nrm -f /tmp/nimbus-smoke-apps-after-restart.json',
    "agent_container=",
    'test -n "$agent_container"',
    "if ! mounts=",
    "if printf",
  );

  const inspectStart = script.indexOf("if ! mounts=");
  const inspectEnd = script.indexOf("if printf", inspectStart);
  assert.ok(inspectStart >= 0);
  assert.ok(inspectEnd > inspectStart);
  const inspectBlock = script.slice(inspectStart, inspectEnd);
  assert.match(inspectBlock, /docker inspect "\$agent_container" --format/);
  assert.match(inspectBlock, /could not inspect the metrics-agent container/);
  assert.match(inspectBlock, /exit 1/);
  assert.match(inspectBlock, /fi/);

  assert.match(optionalScript, /DOCKER_SOCKET=\/var\/run\/docker\.sock/);
  assert.match(optionalScript, /docker compose -f docker-compose\.yml -f docker-compose\.docker\.yml config/);
  assert.doesNotMatch(optionalScript, /\$SMOKE_PROJECT/);
});
