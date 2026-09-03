import assert from "node:assert/strict";
import test from "node:test";
import { canPersistHealthResult, type HealthPersistenceSnapshot } from "./health-persistence.ts";

const snapshot: HealthPersistenceSnapshot = {
  rowVersion: 7,
  recordGeneration: "generation-a",
  target: "https://demo.local/health",
  allowInsecureTls: false,
  url: "https://demo.local",
  healthUrl: "https://demo.local/health",
  casaosScheme: null,
  casaosHostname: null,
  casaosPortMap: null,
  casaosIndex: null,
};

test("persists only when the application row and health configuration are unchanged", () => {
  assert.equal(canPersistHealthResult(snapshot, snapshot), true);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, rowVersion: 8 }), false);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, recordGeneration: "generation-b" }), false);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, target: "https://new.local/health" }), false);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, url: "https://changed.local" }), false);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, healthUrl: "https://changed.local/health" }), false);
  assert.equal(canPersistHealthResult(snapshot, { ...snapshot, casaosHostname: "changed.local" }), false);
});
