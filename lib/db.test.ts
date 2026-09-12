import assert from "node:assert/strict";
import test from "node:test";
import { hasStaleDockerMetadata } from "./reconciliation.ts";

test("reconciliation helper only reports metadata that requires clearing", () => {
  assert.equal(hasStaleDockerMetadata({}), false);
  assert.equal(hasStaleDockerMetadata({ containerState: "unknown", containerHealth: "unknown" }), false);
  assert.equal(hasStaleDockerMetadata({ containerState: "running" }), true);
  assert.equal(hasStaleDockerMetadata({ containerStartedAt: "2026-01-01T00:00:00.000Z" }), true);
});
