import { NextResponse } from "next/server";
import { listApps, reconcileDockerApps, removeApp, saveApp } from "@/lib/db";
import { fetchDockerDiscovery } from "@/lib/docker-discovery";
import { parseManagedAppPayload } from "@/lib/app-validation";
import type { DockerContainer } from "@/agent/docker-discovery-types";
import type { ManagedApp } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const discovery = await fetchDockerDiscovery();
  const reconciledApps = discovery.available
    ? reconcileDockerApps(discovery.containers, { preserveUnmatched: discovery.status === "partial" })
    : listApps();
  const apps = reconciledApps.map((app) => ({ ...app, dockerDetails: findDockerDetails(app, discovery.containers) }));
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
  const app = parseManagedAppPayload(await readJson(request));
  if (!app) return NextResponse.json({ error: "invalid application payload" }, { status: 400 });
  const { dockerDetails: _dockerDetails, ...persistedApp } = app;
  return NextResponse.json({ app: saveApp({ ...persistedApp, allowInsecureTls: app.allowInsecureTls === true, source: app.source || "manual" }) });
}

export async function DELETE(request: Request) {
  const payload = await readJson(request);
  const id = isRecord(payload) && typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  removeApp(id);
  return NextResponse.json({ ok: true });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findDockerDetails(app: ManagedApp, containers: DockerContainer[]) {
  const container = containers.find((candidate) => candidate.id === app.containerId);
  if (!container && !app.containerImage) return undefined;
  return {
    image: container?.image || app.containerImage || null,
    networks: container?.networks || [],
    ports: container?.ports || [],
    volumes: container?.volumes || [],
    environment: container?.environment || [],
  };
}
