import { NextResponse } from "next/server";
import { listMetricSnapshots } from "@/lib/db";
import { normalizeHistoryMinutes } from "@/lib/metrics-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const minutes = normalizeHistoryMinutes(new URL(request.url).searchParams.get("minutes"));
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  return NextResponse.json({ minutes, points: listMetricSnapshots(since) });
}