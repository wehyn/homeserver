import type { ManagedApp } from "./types";

export function resolveHealthTarget(app: Pick<ManagedApp, "casaosScheme" | "casaosHostname" | "casaosPortMap" | "casaosIndex" | "healthUrl" | "url">) {
  const casaosTarget = buildCasaOSHealthTarget(app);
  return casaosTarget || app.healthUrl || app.url;
}

export function buildCasaOSHealthTarget(app: Pick<ManagedApp, "casaosScheme" | "casaosHostname" | "casaosPortMap" | "casaosIndex">) {
  if (!app.casaosScheme || !app.casaosHostname || !app.casaosPortMap) return undefined;
  const port = parseCasaOSPort(app.casaosPortMap);
  if (!port) return undefined;
  try {
    const hostname = app.casaosHostname.trim();
    if (!hostname || /[\s/?#@\\]/.test(hostname)) return undefined;
    const authority = hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
    const target = new URL(`${app.casaosScheme}://${authority}`);
    if (target.username || target.password || target.port || target.pathname !== "/" || target.search || target.hash) return undefined;
    target.port = String(port);
    target.pathname = normalizeIndex(app.casaosIndex || "/");
    target.search = "";
    target.hash = "";
    return target.href;
  } catch {
    return undefined;
  }
}

export function parseCasaOSPort(portMap: string) {
  const match = /(?:^|[^0-9])(\d{1,5})(?:[^0-9]|$)/.exec(portMap.trim());
  if (!match) return undefined;
  const port = Number(match[1]);
  return port >= 1 && port <= 65_535 ? port : undefined;
}

export function isCasaOSHealthSuccess(statusCode: number) {
  return statusCode === 200 || statusCode === 401;
}

function normalizeIndex(value: string) {
  const index = value.trim() || "/";
  return index.startsWith("/") ? index : `/${index}`;
}
