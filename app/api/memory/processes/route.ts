import { NextResponse } from "next/server";
import type { MemorySnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agentUrl = process.env.MEMORY_AGENT_URL || "http://metrics-agent:8787";
  const token = process.env.MEMORY_AGENT_TOKEN;

  try {
    const response = await fetch(`${agentUrl.replace(/\/$/, "")}/v1/memory/processes`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2_500),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "The memory metrics agent is unavailable." }, { status: 503 });
    }

    const data: unknown = await response.json();
    if (!isMemorySnapshot(data)) {
      return NextResponse.json({ error: "The memory metrics agent returned invalid data." }, { status: 503 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The memory metrics agent is unavailable." }, { status: 503 });
  }
}

function isMemorySnapshot(value: unknown): value is MemorySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<MemorySnapshot>;
  return typeof snapshot.totalBytes === "number"
    && typeof snapshot.usedBytes === "number"
    && typeof snapshot.availableBytes === "number"
    && typeof snapshot.usedPercent === "number"
    && Array.isArray(snapshot.processes)
    && typeof snapshot.partial === "boolean"
    && typeof snapshot.omittedCount === "number"
    && Array.isArray(snapshot.warnings)
    && typeof snapshot.updatedAt === "string"
    && snapshot.processes.every((process) => Boolean(process)
      && typeof process.pid === "number"
      && typeof process.name === "string"
      && typeof process.command === "string"
      && typeof process.user === "string"
      && typeof process.rssBytes === "number"
      && typeof process.memoryPercent === "number")
    && snapshot.warnings.every((warning) => typeof warning === "string");
}
