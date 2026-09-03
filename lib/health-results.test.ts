import assert from "node:assert/strict";
import test from "node:test";
import { applyHealthResults, type HealthResult } from "./health-results.ts";
import type { ManagedApp } from "./types.ts";

function app(id: string, status: ManagedApp["status"] = "unknown", target = `https://${id}.local`): ManagedApp {
  return {
    id, name: id, description: "", category: "Other", url: target, color: "#fff", status,
    source: "manual", isFavorite: false, isVisible: true, sortOrder: 0,
  };
}

function result(id: string, status: ManagedApp["status"], target = `https://${id}.local`): HealthResult {
  return { id, status, target };
}

test("returns the same app array and objects when health results are no-ops", () => {
  const apps = [app("one", "online"), app("two", "offline")];
  const next = applyHealthResults(apps, [result("one", "online"), result("two", "offline")], apps);
  assert.equal(next, apps);
  assert.equal(next[0], apps[0]);
  assert.equal(next[1], apps[1]);
});

test("updates only the matching app whose status changed", () => {
  const apps = [app("one", "online"), app("two", "offline")];
  const next = applyHealthResults(apps, [result("one", "degraded"), result("two", "offline")], apps);
  assert.notEqual(next, apps);
  assert.notEqual(next[0], apps[0]);
  assert.equal(next[0].status, "degraded");
  assert.equal(next[1], apps[1]);
});

test("ignores results for deleted apps and changed health targets", () => {
  const apps = [app("one", "online"), app("two", "offline")];
  const checkedApps = [app("one", "online", "https://old.one.local"), app("two", "offline")];
  const next = applyHealthResults(apps, [result("missing", "online"), result("one", "offline", "https://old.one.local"), result("two", "online")], checkedApps);
  assert.equal(next[0], apps[0]);
  assert.equal(next[1].status, "online");
});
