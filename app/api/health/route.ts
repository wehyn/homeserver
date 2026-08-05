import https from "node:https";
import { NextResponse } from "next/server";
import { findApp, updateAppStatus } from "@/lib/db";
import { isCasaOSHealthSuccess, resolveHealthTarget } from "@/lib/health-target";
import type { AppStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appId = requestUrl.searchParams.get("id");
  if (!appId) return NextResponse.json({ status: "unknown", error: "id is required" }, { status: 400 });
  const app = findApp(appId);
  if (!app) return NextResponse.json({ status: "unknown", error: "application not found" }, { status: 404 });
  const url = resolveHealthTarget(app);
  if (!url) return NextResponse.json({ status: "unknown" }, { status: 400 });

  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Unsupported target");
    const allowInsecureTls = app.allowInsecureTls === true;
    const started = Date.now();
    const response = allowInsecureTls && target.protocol === "https:"
      ? await requestWithInsecureTls(target)
      : await fetchWithTimeout(target);
    const elapsed = Date.now() - started;
    const successful = isCasaOSHealthSuccess(response.statusCode);
    const status = (successful ? (elapsed > 1800 ? "degraded" : "online") : "degraded") as AppStatus;
    updateAppStatus(appId, status);
    return NextResponse.json({ status, latency: elapsed, statusCode: response.statusCode });
  } catch {
    updateAppStatus(appId, "offline");
    return NextResponse.json({ status: "offline" });
  }
}

async function fetchWithTimeout(target: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(target, { method: "GET", cache: "no-store", redirect: "manual", signal: controller.signal });
    return { statusCode: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

function requestWithInsecureTls(target: URL) {
  return new Promise<{ statusCode: number }>((resolve, reject) => {
    let settled = false;
    const request = https.request(target, { method: "GET", rejectUnauthorized: false }, (response) => {
      const statusCode = response.statusCode ?? 0;
      response.resume();
      response.once("end", () => {
        if (settled) return;
        settled = true;
        resolve({ statusCode });
      });
      response.once("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
    const timeout = setTimeout(() => request.destroy(new Error("Health check timed out")), 4500);
    request.once("error", (error) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.once("close", () => clearTimeout(timeout));
    request.end();
  });
}
