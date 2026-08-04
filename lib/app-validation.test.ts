import assert from "node:assert/strict";
import test from "node:test";
import { parseManagedAppPayload } from "./app-validation.ts";

const validApp = {
  id: "demo",
  name: "Demo",
  description: "A demo app",
  category: "Productivity",
  url: "http://demo.local",
  icon: "",
  color: "#65e6a5",
  healthUrl: "",
  allowInsecureTls: false,
  status: "unknown",
  source: "manual",
  isFavorite: false,
  isVisible: true,
  sortOrder: 0,
};

test("rejects malformed application mutation payloads before database access", () => {
  for (const value of [null, [], {}, { id: "demo", name: "Demo", url: "http://demo.local" }, { ...validApp, sortOrder: NaN }]) {
    assert.equal(parseManagedAppPayload(value), null);
  }
  assert.equal(parseManagedAppPayload({ ...validApp, url: "file:///tmp/demo" }), null);
  assert.equal(parseManagedAppPayload({ ...validApp, icon: "javascript:alert(1)" }), null);
  assert.equal(parseManagedAppPayload({ ...validApp, color: "red" }), null);
});

test("normalizes supported application payload defaults", () => {
  const app = parseManagedAppPayload({ ...validApp, id: " demo ", name: " Demo ", source: undefined, icon: undefined });
  assert.equal(app?.id, "demo");
  assert.equal(app?.name, "Demo");
  assert.equal(app?.source, "manual");
  assert.equal(app?.icon, undefined);
});
