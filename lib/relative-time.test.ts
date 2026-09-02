import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTime } from "./relative-time.ts";

test("formats activity timestamps relative to the supplied clock", () => {
  const now = Date.parse("2026-09-02T08:01:00.000Z");

  assert.equal(formatRelativeTime("2026-09-02T08:00:45.000Z", now), "Just now");
  assert.equal(formatRelativeTime("2026-09-02T08:00:00.000Z", now), "1 minute ago");
  assert.equal(formatRelativeTime("2026-09-02T06:01:00.000Z", now), "2 hours ago");
});
