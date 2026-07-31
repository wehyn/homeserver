import { NextResponse } from "next/server";
import { listActivities } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ activities: listActivities() });
}
