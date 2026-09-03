import assert from "node:assert/strict";
import test from "node:test";
import { getIconSources } from "./icon-sources.ts";

const app = {
  id: "demo",
  name: "Demo",
  url: "https://service.example:8443/dashboard",
  icon: "",
  dockerProject: "demo",
  dockerService: "web",
};

test("derives a changed app's proxy source from its current identity", () => {
  assert.deepEqual(getIconSources({ ...app, id: "first" }), ["/api/icon?id=first"]);
  assert.deepEqual(getIconSources({ ...app, id: "second" }), ["/api/icon?id=second"]);
});

test("derives changed icon sources from current app props", () => {
  assert.deepEqual(getIconSources({ ...app, icon: "https://icons.example/first.png" }), [
    "https://icons.example/first.png",
    "/api/icon?id=demo",
  ]);
  assert.deepEqual(getIconSources({ ...app, icon: "https://icons.example/second.png" }), [
    "https://icons.example/second.png",
    "/api/icon?id=demo",
  ]);
});
