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
  assert.match(script, /smoke_dir="\$\(mktemp -d "\$\{TMPDIR:-\/tmp\}\/nimbus-release-smoke\./);
  assert.match(script, /curl --fail --silent --show-error --connect-timeout 2 --max-time 10/);
  assert.doesNotMatch(script, /\/tmp\/nimbus-smoke/);
  assert.match(script, /compose_config="\$smoke_dir\/compose\.yaml"/);
  assert.match(script, /docker compose -f docker-compose\.yml -p "\$SMOKE_PROJECT" config > "\$compose_config"/);
  assert.match(script, /grep -Fq "DATABASE_PATH: \/app\/data\/nimbus\.db" "\$compose_config"/);
  assert.match(script, /grep -Fq "nimbus-data:" "\$compose_config"/);
  assert.match(script, /rm -rf -- "\$smoke_dir"/);
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
  assert.doesNotMatch(script, /\brg\b/);
  assert.doesNotMatch(script, /COMPOSE_FILE/);
  assert.doesNotMatch(script, /rm -f/);

  for (const composeCommand of script.match(/^\s*docker compose.*$/gm) ?? []) {
    assert.match(composeCommand, /-f docker-compose\.yml/);
  }

  assertScriptOrder(
    'test -d "$HOME/services"',
    'docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" config --quiet',
    "existing_containers=",
    "existing_volumes=",
    "existing_networks=",
    "cleanup() {",
    "trap cleanup EXIT",
    'docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" config > "$compose_config"',
    'docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" up -d --build',
    "  -X POST \\\n",
    'docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" down --remove-orphans',
    'docker compose -f docker-compose.yml -p "$SMOKE_PROJECT" up -d\n',
    "agent_container=",
    'test -n "$agent_container"',
    "if ! mounts=",
    'case "$mounts" in',
  );

  const collisionStart = script.indexOf('if [ -n "$existing_containers" ]');
  const collisionEnd = script.indexOf("\nfi", collisionStart);
  assert.ok(collisionStart >= 0);
  assert.ok(collisionEnd > collisionStart);
  const collisionBlock = script.slice(collisionStart, collisionEnd);
  assert.match(collisionBlock, /\$existing_containers/);
  assert.match(collisionBlock, /\$existing_volumes/);
  assert.match(collisionBlock, /\$existing_networks/);
  assert.match(collisionBlock, /exit 1/);

  const cleanupStart = script.indexOf("cleanup() {");
  const cleanupEnd = script.indexOf("\n}\ntrap cleanup EXIT", cleanupStart);
  assert.ok(cleanupStart >= 0);
  assert.ok(cleanupEnd > cleanupStart);
  assert.ok(collisionStart < cleanupStart);
  assert.ok(collisionEnd < cleanupStart);
  const tempDirStart = script.indexOf('smoke_dir="$(mktemp -d');
  assert.ok(tempDirStart > collisionEnd);
  assert.ok(tempDirStart < cleanupStart);
  const cleanupBlock = script.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBlock, /cleanup\(\) \{\n  exit_code=\$\?/);
  assert.match(cleanupBlock, /docker compose -f docker-compose\.yml -p "\$SMOKE_PROJECT" down --volumes --remove-orphans \|\| true/);
  assert.match(cleanupBlock, /rm -rf -- "\$smoke_dir"/);
  assert.match(cleanupBlock, /exit "\$exit_code"/);

  const postStart = script.indexOf("curl --fail --silent --show-error --connect-timeout 2 --max-time 10 \\\n  -X POST");
  const postEnd = script.indexOf('\n\ndocker compose -f docker-compose.yml -p "$SMOKE_PROJECT" down --remove-orphans', postStart);
  assert.ok(postStart >= 0);
  assert.ok(postEnd > postStart);
  const postBlock = script.slice(postStart, postEnd);
  assert.match(postBlock, /-X POST/);
  assert.match(postBlock, /-H "Content-Type: application\/json"/);
  assert.match(postBlock, /--data '\{"id":"release-smoke"/);
  assert.match(postBlock, /\$SMOKE_URL\/api\/apps/);

  const inspectStart = script.indexOf("if ! mounts=");
  const inspectEnd = script.indexOf('case "$mounts" in', inspectStart);
  assert.ok(inspectStart >= 0);
  assert.ok(inspectEnd > inspectStart);
  const inspectBlock = script.slice(inspectStart, inspectEnd);
  assert.match(inspectBlock, /docker inspect "\$agent_container" --format/);
  assert.match(inspectBlock, /could not inspect the metrics-agent container/);
  assert.match(inspectBlock, /exit 1/);
  assert.match(inspectBlock, /fi/);

  const socketStart = script.indexOf('case "$mounts" in');
  const socketEnd = script.indexOf("esac", socketStart);
  assert.ok(socketStart >= 0);
  assert.ok(socketEnd > socketStart);
  const socketBlock = script.slice(socketStart, socketEnd);
  assert.match(socketBlock, /\/var\/run\/docker\.sock/);
  assert.match(socketBlock, /exit 1/);

  assert.match(optionalScript, /DOCKER_SOCKET=\/var\/run\/docker\.sock/);
  assert.match(optionalScript, /docker compose -f docker-compose\.yml -f docker-compose\.docker\.yml config/);
  assert.doesNotMatch(optionalScript, /\$SMOKE_PROJECT/);
});
