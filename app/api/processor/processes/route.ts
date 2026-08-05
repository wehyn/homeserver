import { NextResponse } from "next/server";
import type { ProcessorSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agentUrl = process.env.MEMORY_AGENT_URL || "http://metrics-agent:8787";
  const token = process.env.MEMORY_AGENT_TOKEN;

  try {
    const response = await fetch(`${agentUrl.replace(/\/$/, "")}/v1/processor/processes`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2_500),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "The processor metrics agent is unavailable." }, { status: 503 });
    }

    const data: unknown = await response.json();
    if (!isProcessorSnapshot(data)) {
      return NextResponse.json({ error: "The processor metrics agent returned invalid data." }, { status: 503 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The processor metrics agent is unavailable." }, { status: 503 });
  }
}

function isProcessorSnapshot(value: unknown): value is ProcessorSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProcessorSnapshot>;
  return isFiniteNumber(snapshot.cpuPercent) && snapshot.cpuPercent >= 0 && snapshot.cpuPercent <= 100
    && isInteger(snapshot.cpuCores) && snapshot.cpuCores > 0
    && Boolean(snapshot.loadAverage)
    && isFiniteNumber(snapshot.loadAverage?.one) && snapshot.loadAverage.one >= 0
    && isFiniteNumber(snapshot.loadAverage?.five) && snapshot.loadAverage.five >= 0
    && isFiniteNumber(snapshot.loadAverage?.fifteen) && snapshot.loadAverage.fifteen >= 0
    && Array.isArray(snapshot.processes)
    && typeof snapshot.sampling === "boolean"
    && typeof snapshot.partial === "boolean"
    && isInteger(snapshot.omittedCount) && snapshot.omittedCount >= 0
    && Array.isArray(snapshot.warnings)
    && typeof snapshot.updatedAt === "string" && snapshot.updatedAt.length > 0
    && snapshot.processes.every((process) => Boolean(process)
      && isInteger(process.pid) && process.pid >= 0
      && typeof process.name === "string"
      && typeof process.command === "string"
      && typeof process.user === "string"
      && isFiniteNumber(process.rssBytes) && process.rssBytes >= 0
      && isFiniteNumber(process.memoryPercent) && process.memoryPercent >= 0 && process.memoryPercent <= 100
      && isFiniteNumber(process.cpuPercent) && process.cpuPercent >= 0 && process.cpuPercent <= 100)
    && snapshot.warnings.every((warning) => typeof warning === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}
