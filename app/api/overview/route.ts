import os from "node:os";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return NextResponse.json({
    uptime: formatUptime(os.uptime()),
    cpu: Math.min(99, Math.max(1, Math.round(os.loadavg()[0] * 18))),
    memory: Math.round(((totalMemory - freeMemory) / totalMemory) * 100),
    storage: 34,
    network: "Local network",
  });
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}
