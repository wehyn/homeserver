import { NextResponse } from "next/server";
import { isMemorySnapshot, readJsonWithinLimit } from "@/lib/process-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agentUrl = process.env.MEMORY_AGENT_URL || "http://metrics-agent:8787";
  const token = process.env.MEMORY_AGENT_TOKEN;

  try {
    const response = await fetch(`${agentUrl.replace(/\/$/, "")}/v1/memory/processes`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(2_500)]),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return NextResponse.json({ error: "The memory metrics agent is unavailable." }, { status: 503 });
    }

    const data: unknown = await readJsonWithinLimit(response);
    if (!isMemorySnapshot(data)) {
      return NextResponse.json({ error: "The memory metrics agent returned invalid data." }, { status: 503 });
    }

    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The memory metrics agent is unavailable." }, { status: 503 });
  }
}
