import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateCpuPercent, calculateProcessCpuPercent, collectProcessorSnapshot, collectSnapshot, sanitizeCommand } from "./process-agent.ts";

test("collectSnapshot reads memory and sorts processes by RSS", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-agent-"));
  const procRoot = join(root, "proc");
  await mkdir(join(procRoot, "10"), { recursive: true });
  await mkdir(join(procRoot, "20"), { recursive: true });
  await writeFile(join(procRoot, "meminfo"), "MemTotal:       1024 kB\nMemAvailable:    256 kB\n");
  await writeFile(join(procRoot, "10", "status"), "Name: node\nUid: 1000 1000 1000 1000\nVmRSS: 128 kB\n");
  await writeFile(join(procRoot, "10", "cmdline"), "/usr/bin/node\0--token\0secret\0--port=3000\0");
  await writeFile(join(procRoot, "20", "status"), "Name: database\nUid: 0 0 0 0\nVmRSS: 64 kB\n");
  await writeFile(join(procRoot, "20", "cmdline"), "/usr/bin/database\0--foreground\0");
  const passwdPath = join(root, "passwd");
  await writeFile(passwdPath, "root:x:0:0:root:/root:/bin/sh\ndeveloper:x:1000:1000::/home/developer:/bin/sh\n");

  try {
    const snapshot = await collectSnapshot({ procRoot, passwdPath });
    assert.equal(snapshot.totalBytes, 1024 * 1024);
    assert.equal(snapshot.availableBytes, 256 * 1024);
    assert.equal(snapshot.usedBytes, 768 * 1024);
    assert.equal(snapshot.usedPercent, 75);
    assert.equal(snapshot.partial, false);
    assert.deepEqual(snapshot.processes.map((process) => process.pid), [10, 20]);
    assert.equal(snapshot.processes[0].user, "developer");
    assert.equal(snapshot.processes[0].rssBytes, 128 * 1024);
    assert.equal(snapshot.processes[0].memoryPercent, 12.5);
    assert.equal(snapshot.processes[0].command, "node --token=<redacted> <redacted> --port=3000");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectSnapshot reports processes that cannot be read", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-agent-"));
  const procRoot = join(root, "proc");
  await mkdir(join(procRoot, "30"), { recursive: true });
  await writeFile(join(procRoot, "meminfo"), "MemTotal:       1024 kB\nMemAvailable:    512 kB\n");

  try {
    const snapshot = await collectSnapshot({ procRoot, passwdPath: join(root, "missing-passwd") });
    assert.equal(snapshot.processes.length, 0);
    assert.equal(snapshot.omittedCount, 1);
    assert.equal(snapshot.partial, true);
    assert.equal(snapshot.warnings.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitizeCommand redacts sensitive arguments and bounds output", () => {
  assert.equal(sanitizeCommand("/usr/bin/app\0--password=secret", "app"), "app --password=<redacted>");
  assert.equal(sanitizeCommand("", "kernel-thread"), "kernel-thread");
  assert.equal(sanitizeCommand(`/usr/bin/app\0${"x".repeat(220)}`, "app").length, 180);
});

test("collectProcessorSnapshot includes every readable process and load data", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-agent-"));
  const procRoot = join(root, "proc");
  await mkdir(join(procRoot, "10"), { recursive: true });
  await mkdir(join(procRoot, "20"), { recursive: true });
  await writeFile(join(procRoot, "stat"), "cpu  100 0 50 850 0 0 0 0\ncpu0 50 0 25 425 0 0 0 0\ncpu1 50 0 25 425 0 0 0 0\n");
  await writeFile(join(procRoot, "loadavg"), "1.25 0.75 0.50 1/100 20\n");
  await writeFile(join(procRoot, "meminfo"), "MemTotal:       1024 kB\nMemAvailable:    256 kB\n");
  await writeFile(join(procRoot, "10", "status"), "Name: node\nUid: 1000 1000 1000 1000\nVmRSS: 128 kB\n");
  await writeFile(join(procRoot, "10", "cmdline"), "/usr/bin/node\0server.js\0");
  await writeFile(join(procRoot, "10", "stat"), "10 (node) S 1 1 1 1 1 1 1 1 1 1 100 20\n");
  await writeFile(join(procRoot, "20", "status"), "Name: database\nUid: 0 0 0 0\nVmRSS: 64 kB\n");
  await writeFile(join(procRoot, "20", "cmdline"), "/usr/bin/database\0--foreground\0");
  await writeFile(join(procRoot, "20", "stat"), "20 (database) S 1 1 1 1 1 1 1 1 1 1 50 10\n");
  const passwdPath = join(root, "passwd");
  await writeFile(passwdPath, "root:x:0:0:root:/root:/bin/sh\ndeveloper:x:1000:1000::/home/developer:/bin/sh\n");

  try {
    const snapshot = await collectProcessorSnapshot({ procRoot, passwdPath });
    assert.equal(snapshot.cpuCores, 2);
    assert.deepEqual(snapshot.loadAverage, { one: 1.25, five: 0.75, fifteen: 0.5 });
    assert.equal(snapshot.processes.length, 2);
    assert.deepEqual(snapshot.processes.map((process) => process.pid).sort(), [10, 20]);
    assert.equal(snapshot.processes.find((process) => process.pid === 10)?.command, "node server.js");
    assert.equal(snapshot.processes.find((process) => process.pid === 10)?.memoryPercent, 12.5);
    assert.equal(snapshot.sampling, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CPU percentages use total system CPU as the denominator", () => {
  assert.equal(calculateCpuPercent(200, 50), 75);
  assert.equal(calculateProcessCpuPercent(50, 200), 25);
  assert.equal(calculateProcessCpuPercent(-10, 200), 0);
});
