import assert from "node:assert/strict";
import test from "node:test";
import { createTtlCache } from "./ttl-cache.ts";
import { mapWithConcurrency } from "./async-work.ts";

test("coalesces concurrent samples and reuses values during the TTL", async () => {
  let now = 1000;
  let calls = 0;
  const cache = createTtlCache(100, () => now);
  const sample = async () => {
    calls += 1;
    await Promise.resolve();
    return { sampledAt: calls };
  };

  const [first, second] = await Promise.all([cache.get(sample), cache.get(sample)]);
  assert.deepEqual(first, { sampledAt: 1 });
  assert.deepEqual(second, { sampledAt: 1 });
  assert.equal(calls, 1);

  const reused = await cache.get(sample);
  assert.deepEqual(reused, { sampledAt: 1 });
  assert.equal(calls, 1);

  now = 1100;
  assert.deepEqual(await cache.get(sample), { sampledAt: 2 });
  assert.equal(calls, 2);
});

test("does not let one bounded task prevent later tasks from completing", async () => {
  let active = 0;
  let peak = 0;
  const values = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(values, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
  assert.equal(active, 0);
});
