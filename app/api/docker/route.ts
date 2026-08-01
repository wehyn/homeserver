import { NextResponse } from "next/server";
import { fetchDockerDiscovery } from "@/lib/docker-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const discovery = await fetchDockerDiscovery();
  return NextResponse.json(discovery, { status: discovery.available ? 200 : 503 });
}
