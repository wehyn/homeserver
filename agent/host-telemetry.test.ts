import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectHostTelemetry } from "./host-telemetry.ts";

test("collectHostTelemetry reads sensors, network counters, disks, and software RAID", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-host-telemetry-"));
  const thermalRoot = join(root, "thermal");
  const networkRoot = join(root, "net");
  const blockRoot = join(root, "block");
  const procRoot = join(root, "proc");
  await mkdir(join(thermalRoot, "thermal_zone0"), { recursive: true });
  await mkdir(join(networkRoot, "eth0", "statistics"), { recursive: true });
  await mkdir(join(blockRoot, "sda", "device"), { recursive: true });
  await mkdir(procRoot, { recursive: true });
  await writeFile(join(thermalRoot, "thermal_zone0", "temp"), "42500\n");
  await writeFile(join(thermalRoot, "thermal_zone0", "type"), "cpu-thermal\n");
  await writeFile(join(networkRoot, "eth0", "operstate"), "up\n");
  await writeFile(join(networkRoot, "eth0", "statistics", "rx_bytes"), "100\n");
  await writeFile(join(networkRoot, "eth0", "statistics", "tx_bytes"), "200\n");
  await writeFile(join(blockRoot, "sda", "device", "state"), "running\n");
  await writeFile(join(blockRoot, "sda", "ro"), "0\n");
  await writeFile(join(procRoot, "mdstat"), "Personalities : [raid1]\nmd0 : active raid1 sda1[0] sdb1[1]\n");

  try {
    const snapshot = await collectHostTelemetry({ procRoot, thermalRoot, networkRoot, blockRoot });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.temperatures[0]?.celsius, 42.5);
    assert.deepEqual(snapshot.network[0], { name: "eth0", state: "up", receiveBytes: 100, transmitBytes: 200 });
    assert.deepEqual(snapshot.disks[0], { name: "sda", state: "running", readOnly: false, smart: "unavailable" });
    assert.deepEqual(snapshot.raid[0], { name: "md0", state: "active", detail: "raid1 sda1[0] sdb1[1]" });
    assert.equal(snapshot.ups.status, "unavailable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectHostTelemetry does not turn unreadable values into zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-host-telemetry-empty-"));
  const thermalRoot = join(root, "thermal");
  const networkRoot = join(root, "net");
  const blockRoot = join(root, "block");
  const procRoot = join(root, "proc");
  await mkdir(join(thermalRoot, "thermal_zone0"), { recursive: true });
  await mkdir(join(networkRoot, "eth0", "statistics"), { recursive: true });
  await mkdir(join(blockRoot, "sda"), { recursive: true });
  await mkdir(procRoot, { recursive: true });
  await writeFile(join(thermalRoot, "thermal_zone0", "temp"), "\n");
  await writeFile(join(networkRoot, "eth0", "operstate"), "unknown\n");
  await writeFile(join(procRoot, "mdstat"), "");

  try {
    const snapshot = await collectHostTelemetry({ procRoot, thermalRoot, networkRoot, blockRoot });
    assert.deepEqual(snapshot.temperatures, []);
    assert.deepEqual(snapshot.network, [{ name: "eth0", state: "unknown", receiveBytes: null, transmitBytes: null }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
