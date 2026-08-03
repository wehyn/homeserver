import { NextResponse } from "next/server";
import { listApps, reconcileDockerApps, removeApp, saveApp } from "@/lib/db";
import { fetchDockerDiscovery } from "@/lib/docker-discovery";
import type { ManagedApp } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const discovery = await fetchDockerDiscovery();
  const apps = discovery.available
    ? reconcileDockerApps(discovery.containers, { preserveUnmatched: discovery.status === "partial" })
    : listApps();
  return NextResponse.json({
    apps,
    docker: {
      available: discovery.available,
      status: discovery.status,
      warnings: discovery.warnings,
      updatedAt: discovery.updatedAt,
    },
  });
}

export async function POST(request: Request) {
  const app = (await request.json()) as ManagedApp;
  if (!app.id || !app.name || !app.url) return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  return NextResponse.json({ app: saveApp({ ...app, allowInsecureTls: app.allowInsecureTls === true, source: app.source || "manual" }) });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  removeApp(id);
  return NextResponse.json({ ok: true });
}
