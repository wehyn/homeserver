import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ status: "unknown" }, { status: 400 });

  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("Unsupported protocol");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const started = Date.now();
    try {
      const response = await fetch(target, { method: "GET", cache: "no-store", signal: controller.signal });
      const elapsed = Date.now() - started;
      return NextResponse.json({ status: response.ok ? (elapsed > 1800 ? "degraded" : "online") : "degraded", latency: elapsed });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
