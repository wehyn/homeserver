import { NextResponse } from "next/server";
import { listApps, removeApp, saveApp } from "@/lib/db";
import type { ManagedApp } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ apps: listApps() });
}

export async function POST(request: Request) {
  const app = (await request.json()) as ManagedApp;
  if (!app.id || !app.name || !app.url) return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  return NextResponse.json({ app: saveApp({ ...app, source: app.source || "manual" }) });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  removeApp(id);
  return NextResponse.json({ ok: true });
}
