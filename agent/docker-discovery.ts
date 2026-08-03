import { request as httpRequest } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type {
  CasaOSWebUI,
  DockerContainer,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerHealthState,
  DockerPort,
} from "./docker-discovery-types.ts";

type JsonRecord = Record<string, unknown>;
type JsonFetcher = (path: string, init?: { signal?: AbortSignal }) => Promise<unknown>;

export type DockerDiscoveryOptions = {
  socketPath?: string;
  servicesRoot?: string;
  requestJson?: JsonFetcher;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 2_500;
const composeFileNames = new Set(["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]);

export async function collectDockerSnapshot(options: DockerDiscoveryOptions = {}): Promise<DockerDiscoveryResponse> {
  const socketPath = options.socketPath ?? process.env.DOCKER_SOCKET ?? "";
  const servicesRoot = options.servicesRoot ?? process.env.DOCKER_SERVICES_ROOT ?? "/host/services";
  if (!socketPath) return createUnavailableDockerDiscovery("Docker discovery is not configured; the Docker socket is disabled.", servicesRoot);

  const requestJson = options.requestJson || ((path, init) => requestDockerSocket(socketPath, path, init?.signal, options.timeoutMs || DEFAULT_TIMEOUT_MS));
  let summaries: unknown[];
  try {
    summaries = parseDockerContainerList(await requestJson("/containers/json?all=true"));
  } catch (error) {
    return createUnavailableDockerDiscovery(`Docker discovery is unavailable: ${getErrorMessage(error)}.`, servicesRoot);
  }

  const metadata = await readComposeMetadata(servicesRoot);
  const warnings = [...metadata.warnings];
  const containers: DockerContainer[] = [];
  for (const summary of summaries) {
    const id = readString(asRecord(summary)?.Id);
    if (!id) {
      warnings.push("Docker returned a container without an id; it was omitted.");
      continue;
    }

    let inspect: unknown;
    try {
      inspect = await requestJson(`/containers/${encodeURIComponent(id)}/json`);
    } catch {
      warnings.push(`Metadata is unavailable for Docker container ${id.slice(0, 12)}.`);
    }

    const inspectState = asRecord(asRecord(inspect)?.State);
    const state = normalizeDockerState(readString(inspectState?.Status) || readString(asRecord(summary)?.State));
    const container = normalizeDockerContainer(summary, inspect, metadata.entries, state);
    if (container) containers.push(container);
    else warnings.push(`Docker container ${id.slice(0, 12)} could not be normalized; it was omitted.`);
  }

  const uniqueWarnings = [...new Set(warnings)].sort();
  return {
    schemaVersion: 1,
    available: true,
    status: uniqueWarnings.length ? "partial" : "available",
    source: "read-only-agent",
    servicesRoot: servicesRoot || null,
    containers: containers.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    warnings: uniqueWarnings,
    updatedAt: new Date().toISOString(),
  };
}

export function createUnavailableDockerDiscovery(warning: string, servicesRoot: string | null = null): DockerDiscoveryResponse {
  return {
    schemaVersion: 1,
    available: false,
    status: "unavailable",
    source: "unavailable",
    servicesRoot: servicesRoot || null,
    containers: [],
    warnings: [warning],
    updatedAt: new Date().toISOString(),
  };
}

export function parseDockerContainerList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record && Array.isArray(record.containers)) return record.containers;
  throw new Error("The Docker adapter returned an invalid container list.");
}

export function normalizeDockerContainer(
  summary: unknown,
  inspect: unknown = undefined,
  metadata: ComposeMetadataEntry[] = [],
  fallbackState?: DockerContainerState,
): DockerContainer | null {
  const summaryRecord = asRecord(summary);
  const inspectRecord = asRecord(inspect);
  if (!summaryRecord && !inspectRecord) return null;

  const id = readString(summaryRecord?.Id) || readString(inspectRecord?.Id);
  if (!id) return null;
  const config = asRecord(inspectRecord?.Config);
  const stateRecord = asRecord(inspectRecord?.State);
  const labels = { ...readLabels(summaryRecord?.Labels), ...readLabels(config?.Labels) };
  const names = readStringArray(summaryRecord?.Names).map((name) => name.replace(/^\/+/, "").trim()).filter(Boolean);
  const inspectName = readString(inspectRecord?.Name)?.replace(/^\/+/, "").trim();
  const name = inspectName || names[0] || id.slice(0, 12);
  const project = labels["com.docker.compose.project"] || null;
  const service = labels["com.docker.compose.service"] || null;
  const state = normalizeDockerState(readString(stateRecord?.Status) || readString(summaryRecord?.State) || fallbackState || null);
  const composeMetadata = metadata.find((entry) => entry.project === project && (!service || entry.service === service))?.casaos || null;

  return {
    id,
    name,
    image: readString(summaryRecord?.Image) || readString(config?.Image),
    compose: { project, service },
    labels: filterPublicLabels(labels),
    state,
    statusText: readString(summaryRecord?.Status),
    health: normalizeDockerHealth(stateRecord?.Health, Boolean(stateRecord)),
    casaos: composeMetadata,
    ports: normalizeDockerPorts(summaryRecord?.Ports, asRecord(asRecord(inspectRecord?.NetworkSettings)?.Ports)),
    createdAt: normalizeTimestamp(inspectRecord?.Created ?? summaryRecord?.Created),
    startedAt: normalizeTimestamp(stateRecord?.StartedAt),
  };
}

export type ComposeMetadataEntry = {
  project: string;
  service: string;
  casaos: CasaOSWebUI;
};

export async function readComposeMetadata(root: string): Promise<{ entries: ComposeMetadataEntry[]; warnings: string[] }> {
  if (!root) return { entries: [], warnings: [] };
  const files: string[] = [];
  const warnings: string[] = [];
  await collectComposeFiles(root, files, [], warnings);
  const entries: ComposeMetadataEntry[] = [];
  for (const file of files) {
    try {
      const text = await readFile(file, "utf8");
      const parsed = parseCasaOSMetadata(text);
      if (!parsed) continue;
      const relativeFile = relative(root, file);
      const relativeParts = relativeFile.split("/");
      const project = parseComposeProject(text) || (relativeParts.length > 1 ? relativeParts[0] : basename(root)) || "unknown";
      const services = parseComposeServices(text);
      for (const service of services) entries.push({ project, service, casaos: parsed });
    } catch {
      warnings.push(`Compose metadata is unavailable for ${relative(root, file)}.`);
    }
  }
  return { entries, warnings };
}

export function parseCasaOSMetadata(text: string): CasaOSWebUI | null {
  const lines = text.split(/\r?\n/);
  const marker = lines.findIndex((line) => /^\s*x-casaos:\s*(?:#.*)?$/.test(line));
  if (marker < 0) return null;
  const markerIndent = lines[marker].search(/\S/);
  const values: Record<string, string> = {};
  for (const line of lines.slice(marker + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.search(/\S/);
    if (indent >= 0 && indent <= markerIndent) break;
    const match = /^\s*([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = stripYamlScalar(match[2]);
  }
  const scheme = values.scheme === "https" ? "https" : values.scheme === "http" ? "http" : null;
  const hostname = values.hostname?.trim();
  const portMap = values.port_map?.trim();
  if (!scheme || !hostname || !portMap) return null;
  return { scheme, hostname, portMap, index: normalizeIndex(values.index || "/") };
}

export function parseComposeProject(text: string): string | null {
  const match = /^\s*name:\s*([^#\s].*?)\s*$/m.exec(text);
  return match ? stripYamlScalar(match[1]) : null;
}

export function parseComposeServices(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const marker = lines.findIndex((line) => /^\s*services:\s*(?:#.*)?$/.test(line));
  if (marker < 0) return [];
  const markerIndent = lines[marker].search(/\S/);
  const serviceIndent = lines.slice(marker + 1)
    .map((line) => /^(\s+)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => match[1].length)
    .find((indent) => indent > markerIndent);
  if (serviceIndent === undefined) return [];
  const services: string[] = [];
  for (const line of lines.slice(marker + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.search(/\S/);
    if (indent >= 0 && indent <= markerIndent) break;
    const match = /^(\s+)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/.exec(line);
    if (match && match[1].length === serviceIndent) services.push(match[2]);
  }
  return services;
}

async function collectComposeFiles(directory: string, output: string[], ancestors: string[], warnings: string[]) {
  if (ancestors.length > 5) return;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    warnings.push(`Compose metadata is unavailable under ${directory}.`);
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectComposeFiles(path, output, [...ancestors, entry.name], warnings);
    else if (entry.isFile() && composeFileNames.has(entry.name)) output.push(path);
  }
}

function requestDockerSocket(socketPath: string, path: string, signal: AbortSignal | undefined, timeoutMs: number) {
  return new Promise<unknown>((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method: "GET", headers: { Accept: "application/json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          reject(new Error(`Docker Engine returned HTTP ${response.statusCode || 500}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error("Docker Engine returned invalid JSON")); }
      });
    });
    const timeout = setTimeout(() => request.destroy(new Error("Docker request timed out")), timeoutMs);
    const abort = () => request.destroy(new Error("Docker request aborted"));
    signal?.addEventListener("abort", abort, { once: true });
    request.on("error", reject);
    request.on("close", () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); });
    request.end();
  });
}

function normalizeDockerState(value: string | null): DockerContainerState {
  switch (value?.toLowerCase()) {
    case "created": case "restarting": case "running": case "removing": case "paused": case "exited": case "dead":
      return value.toLowerCase() as DockerContainerState;
    default: return "unknown";
  }
}

function normalizeDockerHealth(value: unknown, hasInspectState: boolean): DockerHealthState {
  const health = asRecord(value);
  switch (readString(health?.Status)?.toLowerCase()) {
    case "healthy": return "healthy";
    case "unhealthy": return "unhealthy";
    case "starting": return "starting";
    default: return hasInspectState ? "none" : "unknown";
  }
}

function normalizeDockerPorts(...values: unknown[]): DockerPort[] {
  const ports: DockerPort[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const record = asRecord(item);
        const containerPort = readNumber(record?.PrivatePort);
        if (containerPort !== null) ports.push({ containerPort, protocol: normalizeProtocol(readString(record?.Type)), hostIp: readString(record?.IP), hostPort: readNumber(record?.PublicPort) });
      }
      continue;
    }
    const record = asRecord(value);
    if (!record) continue;
    for (const [key, bindings] of Object.entries(record)) {
      const [port, protocol] = key.split("/");
      const containerPort = readNumber(port);
      if (containerPort === null) continue;
      if (!Array.isArray(bindings) || !bindings.length) ports.push({ containerPort, protocol: normalizeProtocol(protocol), hostIp: null, hostPort: null });
      else for (const binding of bindings) {
        const item = asRecord(binding);
        ports.push({ containerPort, protocol: normalizeProtocol(protocol), hostIp: readString(item?.HostIp), hostPort: readNumber(item?.HostPort) });
      }
    }
  }
  const unique = new Map<string, DockerPort>();
  for (const port of ports) unique.set([port.containerPort, port.protocol, port.hostIp || "", port.hostPort ?? ""].join(":"), port);
  return [...unique.values()].sort((left, right) => left.containerPort - right.containerPort || (left.hostPort ?? 0) - (right.hostPort ?? 0));
}

function normalizeProtocol(value: string | null): DockerPort["protocol"] {
  return value === "tcp" || value === "udp" || value === "sctp" ? value : "unknown";
}

function filterPublicLabels(labels: Record<string, string>) {
  const allowed = new Set(["com.docker.compose.project", "com.docker.compose.service", "com.nimbus.app-id"]);
  return Object.fromEntries(Object.entries(labels).filter(([key]) => allowed.has(key)));
}

function readLabels(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return record ? Object.fromEntries(Object.entries(record).filter(([, item]) => typeof item === "string")) as Record<string, string> : {};
}

function readString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function readStringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function readNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, number) : null;
}
function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString();
  if (typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
  return null;
}
function normalizeIndex(value: string) { return value.startsWith("/") ? value : `/${value}`; }
function stripYamlScalar(value: string) { return value.replace(/\s+#.*$/, "").trim().replace(/^("|')(.*)\1$/, "$2"); }
function asRecord(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "the Docker Engine returned an unexpected error"; }
