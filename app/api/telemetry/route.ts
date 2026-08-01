import { NextResponse } from "next/server";
import { getTelemetrySnapshot } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const telemetry = await getTelemetrySnapshot();
  return NextResponse.json(telemetry, { status: telemetry.status === "unavailable" ? 503 : 200 });
}
