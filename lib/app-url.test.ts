import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppLaunchUrl } from "./app-url.ts";

const dockerApp = {
  url: "http://192.168.2.116:2283/photos",
  dockerProject: "immich",
  dockerService: "immich-server",
  containerId: undefined,
  dockerDetails: undefined,
};

test("uses the current Nimbus host for Docker-backed app links", () => {
  assert.equal(resolveAppLaunchUrl(dockerApp, "100.123.45.66"), "http://100.123.45.66:2283/photos");
  assert.equal(resolveAppLaunchUrl(dockerApp, "192.168.2.116"), dockerApp.url);
});

test("keeps non-local app links unchanged", () => {
  assert.equal(resolveAppLaunchUrl({ ...dockerApp, dockerProject: undefined, dockerService: undefined }, "100.123.45.66"), dockerApp.url);
});
