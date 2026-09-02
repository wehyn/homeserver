import http from "node:http";
import https from "node:https";
import { NextResponse } from "next/server";
import { findApp } from "@/lib/db";
import { validateRasterIcon } from "@/lib/icon-validation";

export const runtime = "nodejs";

const iconTimeoutMs = 4500;
const maxIconBytes = 512 * 1024;
const fallbackIconPaths = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png", "/static/favicon.ico", "/static/favicon.png"];

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const app = findApp(id);
  if (!app) return NextResponse.json({ error: "application not found" }, { status: 404 });

  try {
    const target = new URL(app.url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Unsupported target");
    const allowInsecureTls = app.allowInsecureTls === true;
    const deadline = Date.now() + iconTimeoutMs;
    const candidates = new Set<string>();

    try {
      const page = await requestResource(target, allowInsecureTls, deadline - Date.now());
      extractIconUrls(page.body, target).forEach((url) => candidates.add(url.href));
    } catch {
      // Try the conventional icon paths even when the app page is unavailable.
    }
    fallbackIconPaths.forEach((path) => candidates.add(new URL(path, target).href));

    for (const candidate of candidates) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const candidateUrl = new URL(candidate);
        if (candidateUrl.origin !== target.origin) continue;
        const icon = await requestResource(candidateUrl, allowInsecureTls, remaining);
        const contentType = validateRasterIcon(icon.body, icon.contentType);
        if (contentType) return iconResponse(icon.body, contentType);
      } catch {
        // Try the next declared or conventional icon path.
      }
    }
  } catch {
    // Return a normal missing resource response so the browser can use its UI fallback.
  }
  return new NextResponse(null, { status: 404 });
}

function iconResponse(body: Buffer, contentType: string) {
  const payload = new Uint8Array(body.byteLength);
  payload.set(body);
  return new NextResponse(payload.buffer, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": contentType,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function requestResource(target: URL, allowInsecureTls: boolean, timeoutMs: number) {
  return new Promise<{ body: Buffer; contentType: string }>((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request(target, {
      headers: { Accept: "image/*" },
      method: "GET",
      ...(target.protocol === "https:" && allowInsecureTls ? { rejectUnauthorized: false } : {}),
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Icon request returned ${statusCode}`));
        return;
      }

      const contentLength = Number(response.headers["content-length"] || 0);
      if (contentLength > maxIconBytes) {
        response.resume();
        reject(new Error("Icon response is too large"));
        return;
      }

      const chunks: Buffer[] = [];
      let byteLength = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteLength += buffer.length;
        if (byteLength > maxIconBytes) {
          request.destroy(new Error("Icon response is too large"));
          return;
        }
        chunks.push(buffer);
      });
      response.once("end", () => resolve({
        body: Buffer.concat(chunks),
        contentType: String(response.headers["content-type"] || "image/x-icon").split(";", 1)[0],
      }));
      response.once("error", reject);
    });

    const timeout = setTimeout(() => request.destroy(new Error("Icon request timed out")), timeoutMs);
    request.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request.once("close", () => clearTimeout(timeout));
    request.end();
  });
}

function extractIconUrls(body: Buffer, base: URL) {
  const candidates: URL[] = [];
  const linkTags = body.toString("utf8").match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const rel = readAttribute(tag, "rel")?.toLowerCase().split(/\s+/) || [];
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) continue;
    const href = readAttribute(tag, "href");
    if (!href) continue;
    try {
      const target = new URL(href, base);
      if (!["http:", "https:"].includes(target.protocol) || target.origin !== base.origin) continue;
      candidates.push(target);
    } catch {
      // Ignore malformed icon declarations.
    }
  }
  return candidates;
}

function readAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] || match?.[2] || match?.[3];
}
