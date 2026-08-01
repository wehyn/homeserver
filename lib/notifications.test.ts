import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationTransition } from "./notifications.ts";

test("does not alert on the first known health result", () => {
  assert.equal(getNotificationTransition("media", "Media", undefined, "offline"), null);
  assert.equal(getNotificationTransition("media", "Media", "unknown", "offline"), null);
});

test("does not alert for unknown results or unchanged polling results", () => {
  assert.equal(getNotificationTransition("media", "Media", "online", "unknown"), null);
  assert.equal(getNotificationTransition("media", "Media", "offline", "offline"), null);
  assert.equal(getNotificationTransition("media", "Media", "degraded", "degraded"), null);
});

test("creates an outage event when a known service degrades or goes offline", () => {
  assert.deepEqual(getNotificationTransition("media", "Media", "online", "offline"), {
    appId: "media",
    appName: "Media",
    previousStatus: "online",
    status: "offline",
    kind: "outage",
    title: "Media needs attention",
    body: "Media changed from online to offline.",
  });
  assert.equal(getNotificationTransition("media", "Media", "offline", "degraded")?.kind, "outage");
});

test("creates a recovery event when a service returns online", () => {
  assert.deepEqual(getNotificationTransition("media", "Media", "degraded", "online"), {
    appId: "media",
    appName: "Media",
    previousStatus: "degraded",
    status: "online",
    kind: "recovery",
    title: "Media is back online",
    body: "Media recovered from degraded.",
  });
});
