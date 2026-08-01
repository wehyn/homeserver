import https from "node:https";
import { NextResponse } from "next/server";
import { findApp, updateAppStatus } from "@/lib/db";
import type { AppStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  const appId = new URL(request.url).searchParams.get("id");
  if (!url) return NextResponse.json({ status: "unknown" }, { status: 400 });

  try {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("Unsupported protocol");
    const app = appId ? findApp(appId) : undefined;
    const configuredTarget = app?.healthUrl || app?.url;
    const allowInsecureTls = app?.allowInsecureTls === true && configuredTarget ? new URL(configuredTarget).href === target.href : false;
    const started = Date.now();
    const response = allowInsecureTls && target.protocol === "https:"
      ? await requestWithInsecureTls(target)
      : await fetchWithTimeout(target);
    const elapsed = Date.now() - started;
    const status = (response.ok ? (elapsed > 1800 ? "degraded" : "online") : "degraded") as AppStatus;
    if (appId) updateAppStatus(appId, status);
    return NextResponse.json({ status, latency: elapsed });
  } catch {
    if (appId) updateAppStatus(appId, "offline");
    return NextResponse.json({ status: "offline" });
  }
}

async function fetchWithTimeout(target: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(target, { method: "GET", cache: "no-store", signal: controller.signal });
    return { ok: response.ok };
  } finally {
    clearTimeout(timeout);
  }
}

function requestWithInsecureTls(target: URL) {
  return new Promise<{ ok: boolean }>((resolve, reject) => {
    let settled = false;
    const request = https.request(target, { method: "GET", rejectUnauthorized: false }, (response) => {
      const statusCode = response.statusCode ?? 0;
      response.resume();
      response.once("end", () => {
        if (settled) return;
        settled = true;
        resolve({ ok: statusCode >= 200 && statusCode < 400 });
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
