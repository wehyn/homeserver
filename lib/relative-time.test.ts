import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTime, startActivityClock } from "./relative-time.ts";

test("formats activity timestamps relative to the supplied clock", () => {
  const now = Date.parse("2026-09-02T08:01:00.000Z");

  assert.equal(formatRelativeTime("2026-09-02T08:00:45.000Z", now), "Just now");
  assert.equal(formatRelativeTime("2026-09-02T08:00:00.000Z", now), "1 minute ago");
  assert.equal(formatRelativeTime("2026-09-02T07:01:00.000Z", now), "1 hour ago");
  assert.equal(formatRelativeTime("2026-09-01T08:01:00.000Z", now), "1 day ago");
  assert.equal(formatRelativeTime("2026-09-02T08:02:00.000Z", now), "Just now");
  assert.equal(formatRelativeTime("not a timestamp", now), "Recently");
});

test("activity clock schedules one modest interval and cleans it up", () => {
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  const cancelled: unknown[] = [];
  let updates = 0;
  const handle = { id: "activity-clock" };
  const stop = startActivityClock(
    () => { updates += 1; },
    (callback, delay) => {
      scheduled.push({ callback, delay });
      return handle;
    },
    (cancelledHandle) => cancelled.push(cancelledHandle),
  );

  assert.deepEqual(scheduled.map(({ delay }) => delay), [30_000]);
  scheduled[0].callback();
  assert.equal(updates, 1);

  stop();
  assert.deepEqual(cancelled, [handle]);
});
