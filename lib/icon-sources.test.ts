import assert from "node:assert/strict";
import test from "node:test";
import { getIconSources } from "./icon-sources.ts";

const app = {
  id: "demo",
  name: "Demo",
  url: "https://service.example:8443/dashboard",
  icon: "",
};

test("uses only the same-origin proxy for configured application favicons", () => {
  assert.deepEqual(getIconSources(app), ["/api/icon?id=demo"]);
});

test("keeps known and custom icons ahead of the proxy", () => {
  assert.deepEqual(getIconSources({ ...app, id: "crafty-controller", icon: "https://icons.example/crafty.png" }), [
    "/icons/crafty-controller.ico",
    "https://icons.example/crafty.png",
    "/api/icon?id=crafty-controller",
  ]);
});

test("returns no network source when an app URL cannot be parsed", () => {
  assert.deepEqual(getIconSources({ ...app, url: "not a URL" }), []);
});

test("does not add a direct service URL when proxy mode is disabled", () => {
  assert.deepEqual(getIconSources(app, false), []);
});
