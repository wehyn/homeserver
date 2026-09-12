import assert from "node:assert/strict";
import test from "node:test";
import { collectDockerSnapshot } from "./docker-discovery.ts";

test("Docker discovery honors an already-aborted caller signal before any work", async () => {
  const controller = new AbortController();
  controller.abort();
  let requestCalls = 0;
  const snapshot = await collectDockerSnapshot({
    socketPath: "/var/run/docker.sock",
    servicesRoot: "",
    signal: controller.signal,
    requestJson: async () => {
      requestCalls += 1;
      return [];
    },
  });
  assert.equal(requestCalls, 0);
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.status, "unavailable");
});
