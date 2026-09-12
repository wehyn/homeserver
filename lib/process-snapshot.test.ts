import assert from "node:assert/strict";
import test from "node:test";
import { isMemorySnapshot, isProcessorSnapshot, readJsonWithinLimit } from "./process-snapshot.ts";

const process = { pid: 42, name: "node", command: "node server", user: "developer", rssBytes: 1024, memoryPercent: 1.2 };

function processorSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    cpuPercent: 12,
    cpuCores: 4,
    loadAverage: { one: 0.2, five: 0.3, fifteen: 0.4 },
    processes: [{ ...process, cpuPercent: 8 }],
    totalCount: 1,
    returnedCount: 1,
    unreadableCount: 0,
    policyOmittedCount: 0,
    policyOmittedReason: null,
    sampling: false,
    partial: false,
    omittedCount: 0,
    warnings: [],
    updatedAt: "2026-09-12T12:00:00.000Z",
    ...overrides,
  };
}

function memorySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    totalBytes: 8 * 1024,
    usedBytes: 4 * 1024,
    availableBytes: 4 * 1024,
    usedPercent: 50,
    processes: [process],
    totalCount: 1,
    returnedCount: 1,
    unreadableCount: 0,
    policyOmittedCount: 0,
    policyOmittedReason: null,
    partial: false,
    omittedCount: 0,
    warnings: [],
    updatedAt: "2026-09-12T12:00:00.000Z",
    ...overrides,
  };
}

test("accepts bounded memory and processor snapshots with consistent counts", () => {
  assert.equal(isMemorySnapshot(memorySnapshot()), true);
  assert.equal(isProcessorSnapshot(processorSnapshot()), true);
});

test("rejects process snapshots with inconsistent or oversized collections", () => {
  assert.equal(isMemorySnapshot(memorySnapshot({ totalCount: 2 })), false);
  assert.equal(isMemorySnapshot(memorySnapshot({ returnedCount: 257, processes: Array.from({ length: 257 }, () => process) })), false);
  assert.equal(isMemorySnapshot(memorySnapshot({ totalCount: 2, returnedCount: 1, unreadableCount: 0, policyOmittedCount: 0 })), false);
  assert.equal(isMemorySnapshot(memorySnapshot({ totalCount: 2, returnedCount: 1, unreadableCount: 0, policyOmittedCount: 1, policyOmittedReason: "not-a-reason" })), false);
  assert.equal(isProcessorSnapshot(null), false);
  assert.equal(isProcessorSnapshot(processorSnapshot({ returnedCount: 1, totalCount: 2 })), false);
});

test("does not parse an agent response beyond the byte limit", async () => {
  const valid = await readJsonWithinLimit(new Response(JSON.stringify(memorySnapshot())));
  assert.deepEqual(valid, memorySnapshot());

  const oversized = await readJsonWithinLimit(new Response("x".repeat(512 * 1024 + 1)));
  assert.equal(oversized, null);
});

test("rejects process strings longer than the contract bound", () => {
  assert.equal(isMemorySnapshot(memorySnapshot({ processes: [{ ...process, command: "x".repeat(181) }] })), false);
});