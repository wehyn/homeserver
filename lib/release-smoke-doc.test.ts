import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("release smoke documentation is isolated, persistent, and socket-aware", () => {
  const smoke = readFileSync(join(root, "docs/release-smoke.md"), "utf8");
  assert.match(smoke, /nimbus-release-smoke-/);
  assert.match(smoke, /NIMBUS_BIND_ADDRESS/);
  assert.match(smoke, /NIMBUS_PORT/);
  assert.match(smoke, /\/api\/apps/);
  assert.match(smoke, /\/api\/overview/);
  assert.match(smoke, /--volumes --remove-orphans/);
  assert.match(smoke, /var\/run\/docker\.sock/);
  assert.match(smoke, /example\.invalid/);
});
