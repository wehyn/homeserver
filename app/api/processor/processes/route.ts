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
  return typeof snapshot.cpuPercent === "number"
    && typeof snapshot.cpuCores === "number"
    && Boolean(snapshot.loadAverage)
    && typeof snapshot.loadAverage?.one === "number"
    && typeof snapshot.loadAverage?.five === "number"
    && typeof snapshot.loadAverage?.fifteen === "number"
    && Array.isArray(snapshot.processes)
    && typeof snapshot.sampling === "boolean"
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
      && typeof process.memoryPercent === "number"
      && typeof process.cpuPercent === "number")
    && snapshot.warnings.every((warning) => typeof warning === "string");
}
