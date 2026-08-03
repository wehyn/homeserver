import os from "node:os";
import path from "node:path";
import { statfsSync } from "node:fs";
import { NextResponse } from "next/server";
import { HardwareSampler, type HardwareSnapshot } from "@/agent/hardware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CpuTimes = { idle: number; total: number };
let previousCpuTimes: CpuTimes | undefined;
const localHardwareSampler = new HardwareSampler("/sys");

export async function GET() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const memoryUsed = totalMemory - freeMemory;
  const cpu = await getCpuUsage();
  const storage = getStorageUsage();
  const hardware = await getHardwareSnapshot();

  return NextResponse.json({
    uptime: formatUptime(os.uptime()),
    cpu,
    cpuCores: os.cpus().length,
    temperatureC: hardware.temperatureC,
    powerWatts: hardware.powerWatts,
    powerSource: hardware.powerSource,
    memory: roundPercent((memoryUsed / totalMemory) * 100),
    memoryUsed: formatBytes(memoryUsed),
    memoryTotal: formatBytes(totalMemory),
    storage: storage.usedPercent,
    storageUsed: formatBytes(storage.usedBytes),
    storageAvailable: formatBytes(storage.availableBytes),
    storageTotal: formatBytes(storage.totalBytes),
    network: "Local network",
    updatedAt: new Date().toISOString(),
  });
}

async function getHardwareSnapshot(): Promise<HardwareSnapshot> {
  const agentUrl = process.env.HARDWARE_AGENT_URL;
  if (agentUrl) {
    try {
      const response = await fetch(`${agentUrl.replace(/\/$/, "")}/v1/hardware`, {
        cache: "no-store",
        headers: process.env.MEMORY_AGENT_TOKEN ? { Authorization: `Bearer ${process.env.MEMORY_AGENT_TOKEN}` } : undefined,
        signal: AbortSignal.timeout(1_000),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.ok && isHardwareSnapshot(data)) return data;
    } catch {
      // Fall back to local sysfs when the optional agent is unavailable.
    }
  }

  return localHardwareSampler.getSnapshot();
}

function isHardwareSnapshot(value: unknown): value is HardwareSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<HardwareSnapshot>;
  return (snapshot.temperatureC === null || typeof snapshot.temperatureC === "number")
    && (snapshot.powerWatts === null || typeof snapshot.powerWatts === "number")
    && (snapshot.powerSource === null || snapshot.powerSource === "intel-rapl")
    && typeof snapshot.updatedAt === "string";
}

async function getCpuUsage() {
  const current = readCpuTimes();
  if (!previousCpuTimes) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const next = readCpuTimes();
  const baseline = previousCpuTimes || current;
  previousCpuTimes = next;

  const totalDelta = next.total - baseline.total;
  const idleDelta = next.idle - baseline.idle;
  if (totalDelta <= 0) return 0;
  return roundPercent(Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100)));
}

function readCpuTimes(): CpuTimes {
  return os.cpus().reduce((totals, cpu) => ({
    idle: totals.idle + cpu.times.idle,
    total: totals.total + Object.values(cpu.times).reduce((sum, time) => sum + time, 0),
  }), { idle: 0, total: 0 });
}

function getStorageUsage() {
  const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "nimbus.db");
  const stats = statfsSync(path.dirname(path.resolve(databasePath)));
  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  const usedBytes = totalBytes - availableBytes;
  return {
    totalBytes,
    availableBytes,
    usedBytes,
    usedPercent: totalBytes ? roundPercent((usedBytes / totalBytes) * 100) : 0,
  };
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}
