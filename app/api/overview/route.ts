import os from "node:os";
import path from "node:path";
import { statfsSync } from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CpuTimes = { idle: number; total: number };
let previousCpuTimes: CpuTimes | undefined;

export async function GET() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const memoryUsed = totalMemory - freeMemory;
  const cpu = await getCpuUsage();
  const storage = getStorageUsage();

  return NextResponse.json({
    uptime: formatUptime(os.uptime()),
    cpu,
    cpuCores: os.cpus().length,
    memory: Math.round((memoryUsed / totalMemory) * 100),
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
  return Math.min(100, Math.max(0, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
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
    usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
  };
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
