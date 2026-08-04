import { request as httpRequest } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type {
  CasaOSWebUI,
  DockerContainer,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerEnvironmentVariable,
  DockerHealthState,
  DockerPort,
  DockerServiceDetails,
  DockerVolume,
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
  const composeMetadata = metadata.find((entry) => entry.project === project && (!service || entry.service === service));
  const composeDetails = composeMetadata?.details;
  const inspectedPorts = normalizeDockerPorts(summaryRecord?.Ports, asRecord(asRecord(inspectRecord?.NetworkSettings)?.Ports));
  const inspectedNetworks = normalizeDockerNetworks(asRecord(asRecord(inspectRecord?.NetworkSettings)?.Networks));
  const inspectedVolumes = normalizeDockerVolumes(inspectRecord?.Mounts);
  const inspectedEnvironment = normalizeDockerEnvironment(config?.Env);

  return {
    id,
    name,
    image: readString(summaryRecord?.Image) || readString(config?.Image) || composeDetails?.image || null,
    compose: { project, service },
    labels: filterPublicLabels(labels),
    state,
    statusText: readString(summaryRecord?.Status),
    health: normalizeDockerHealth(stateRecord?.Health, Boolean(stateRecord)),
    casaos: composeMetadata?.casaos || null,
    ports: inspectedPorts.length ? inspectedPorts : composeDetails?.ports || [],
    networks: inspectedNetworks.length ? inspectedNetworks : composeDetails?.networks || [],
    volumes: inspectedVolumes.length ? inspectedVolumes : composeDetails?.volumes || [],
    environment: inspectedEnvironment.length ? inspectedEnvironment : composeDetails?.environment || [],
    createdAt: normalizeTimestamp(inspectRecord?.Created ?? summaryRecord?.Created),
    startedAt: normalizeTimestamp(stateRecord?.StartedAt),
  };
}

export type ComposeMetadataEntry = {
  project: string;
  service: string;
  casaos: CasaOSWebUI | null;
  details: DockerServiceDetails;
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
      const relativeFile = relative(root, file);
      const relativeParts = relativeFile.split("/");
      const project = parseComposeProject(text) || (relativeParts.length > 1 ? relativeParts[0] : basename(root)) || "unknown";
      const services = parseComposeServices(text);
      for (const service of services) entries.push({ project, service, casaos: parsed, details: parseComposeServiceDetails(text, service) });
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
  const lines = text.split(/\r?\n/);
  const rootIndent = lines.map((line) => line.trim() && !/^\s*#/.test(line) ? line.search(/\S/) : -1)
    .find((indent) => indent >= 0) ?? 0;
  for (const line of lines) {
    const match = /^(\s*)name:\s*(.*?)\s*$/.exec(line);
    if (match && match[1].length === rootIndent) {
      const project = stripYamlScalar(match[2]);
      if (project) return project;
    }
  }
  return null;
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

export function parseComposeServiceDetails(text: string, service: string): DockerServiceDetails {
  const block = findComposeServiceBlock(text, service);
  if (!block) return { image: null, networks: [], ports: [], volumes: [], environment: [] };

  const fields = parseComposeFields(block.lines, block.indent);
  return {
    image: fields.image?.value ? stripYamlScalar(fields.image.value) : null,
    networks: parseComposeNetworks(fields.networks),
    ports: parseComposePorts(fields.ports),
    volumes: parseComposeVolumes(fields.volumes),
    environment: parseComposeEnvironment(fields.environment),
  };
}

type ComposeBlock = { lines: string[]; indent: number };
type ComposeField = { value: string; lines: string[]; indent: number };

function findComposeServiceBlock(text: string, service: string): ComposeBlock | null {
  const lines = text.split(/\r?\n/);
  const marker = lines.findIndex((line) => /^\s*services:\s*(?:#.*)?$/.test(line));
  if (marker < 0) return null;
  const markerIndent = lines[marker].search(/\S/);
  const detectedServiceIndent = lines.slice(marker + 1)
    .map((line) => /^(\s+)[A-Za-z0-9_.-]+:\s*(?:#.*)?$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => match[1].length)
    .find((indent) => indent > markerIndent);
  const serviceMatch = lines.slice(marker + 1).map((line, index) => ({ line, index: index + marker + 1, match: /^(\s+)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/.exec(line) }))
    .find((entry) => entry.match && entry.match[2] === service && entry.match[1].length === detectedServiceIndent);
  if (!serviceMatch?.match) return null;
  const serviceIndent = serviceMatch.match[1].length;
  const end = lines.slice(serviceMatch.index + 1).findIndex((line) => {
    if (!line.trim() || /^\s*#/.test(line)) return false;
    const indent = line.search(/\S/);
    return indent >= 0 && indent <= serviceIndent;
  });
  const endIndex = end < 0 ? lines.length : serviceMatch.index + 1 + end;
  return { lines: lines.slice(serviceMatch.index + 1, endIndex), indent: serviceIndent };
}

function parseComposeFields(lines: string[], serviceIndent: number) {
  const fieldIndent = lines.map((line) => {
    const match = /^(\s+)([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    return match && match[1].length > serviceIndent ? match[1].length : null;
  }).filter((indent): indent is number => indent !== null).sort((left, right) => left - right)[0];
  if (fieldIndent === undefined) return {} as Record<string, ComposeField>;

  const fields: Record<string, ComposeField> = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = new RegExp(`^\\s{${fieldIndent}}([A-Za-z][\\w-]*):\\s*(.*?)\\s*$`).exec(lines[index]);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim()) {
        const indent = line.search(/\S/);
        if (indent >= 0 && indent <= fieldIndent) break;
      }
      end += 1;
    }
    fields[match[1]] = { value: match[2], lines: lines.slice(index + 1, end), indent: fieldIndent };
    index = end - 1;
  }
  return fields;
}

function parseComposeNetworks(field?: ComposeField): string[] {
  if (!field) return [];
  const list = parseYamlList(field);
  if (list.length) return [...new Set(list.map((item) => stripYamlScalar(item)).filter(Boolean))].sort();
  return parseYamlMapKeys(field);
}

function parseComposePorts(field?: ComposeField): DockerPort[] {
  if (!field) return [];
  const ports = parseYamlListEntries(field).flatMap((entry) => {
    const values = parseYamlEntryMap(entry);
    if (values.target !== undefined) {
      const containerPort = parseComposePortNumber(values.target);
      if (containerPort === null) return [];
      return [{
        containerPort,
        protocol: normalizeComposeProtocol(values.protocol),
        hostIp: parseComposeScalar(values.host_ip),
        hostPort: parseComposePortNumber(values.published),
      }];
    }
    const port = parseComposePort(entry.value);
    return port ? [port] : [];
  });
  return uniquePorts(ports);
}

function parseComposePort(value: string): DockerPort | null {
  const scalar = stripYamlScalar(value);
  const protocolSeparator = scalar.lastIndexOf("/");
  const mapping = protocolSeparator >= 0 ? scalar.slice(0, protocolSeparator) : scalar;
  const protocol = normalizeComposeProtocol(protocolSeparator >= 0 ? scalar.slice(protocolSeparator + 1) : undefined);
  const bracketedHost = /^\[([^\]]+)\](?::(.*))?$/.exec(mapping);
  let containerPort: number | null;
  let hostPort: number | null;
  let hostIp: string | null;
  if (bracketedHost) {
    const remainder = bracketedHost[2] ? bracketedHost[2].split(":") : [];
    hostIp = bracketedHost[1];
    if (remainder.length === 1) {
      containerPort = parseComposePortNumber(remainder[0]);
      hostPort = null;
    } else if (remainder.length >= 2) {
      containerPort = parseComposePortNumber(remainder[remainder.length - 1]);
      hostPort = parseComposePortNumber(remainder[remainder.length - 2]);
    } else {
      return null;
    }
  } else {
    const parts = mapping.split(":");
    containerPort = parseComposePortNumber(parts[parts.length - 1]);
    hostPort = parts.length > 1 ? parseComposePortNumber(parts[parts.length - 2]) : null;
    hostIp = parts.length > 2 ? parts.slice(0, -2).join(":") || null : null;
  }
  if (containerPort === null || (hostPort !== null && !Number.isFinite(hostPort))) return null;
  return { containerPort, protocol, hostIp, hostPort };
}

function parseComposeVolumes(field?: ComposeField): DockerVolume[] {
  if (!field) return [];
  const volumes: DockerVolume[] = [];
  for (const entry of parseYamlListEntries(field)) {
    const entryValues = parseYamlEntryMap(entry);
    if (entryValues.target !== undefined) {
      const target = parseComposeScalar(entryValues.target);
      if (!target?.startsWith("/")) continue;
      const source = parseComposeScalar(entryValues.source);
      const rawType = parseComposeScalar(entryValues.type);
      const type: DockerVolume["type"] = rawType === "bind" || rawType === "volume" || rawType === "tmpfs"
        ? rawType
        : source?.startsWith("/") || source?.startsWith(".") ? "bind" : source ? "volume" : "unknown";
      const mode = parseComposeScalar(entryValues.mode)
        || (parseComposeScalar(entryValues.read_only) === "true" ? "ro" : parseComposeScalar(entryValues.read_only) === "false" ? "rw" : null);
      volumes.push({ type, source, target, mode });
      continue;
    }

    const scalar = stripYamlScalar(entry.value);
    if (!scalar) continue;
    const parts = scalar.split(":");
    let source: string | null;
    let target: string;
    let mode: string | null;
    if (parts.length === 1) {
      source = null;
      target = parts[0].trim();
      mode = null;
    } else if (parts.length === 2 && parts[1].trim().startsWith("/")) {
      source = parts[0].trim() || null;
      target = parts[1].trim();
      mode = null;
    } else if (parts.length === 2 && parts[0].trim().startsWith("/") && ["ro", "rw", "z", "Z", "cached", "delegated", "consistent"].includes(parts[1].trim())) {
      source = null;
      target = parts[0].trim();
      mode = parts[1].trim();
    } else if (parts.length >= 3) {
      source = parts.slice(0, -2).join(":").trim() || null;
      target = parts[parts.length - 2].trim();
      mode = parts[parts.length - 1].trim() || null;
    } else {
      source = parts[0].trim() || null;
      target = parts[1].trim();
      mode = null;
    }
    if (!target.startsWith("/")) continue;
    volumes.push({ type: source?.startsWith("/") || source?.startsWith(".") ? "bind" : "volume", source, target, mode });
  }

  const mapValues = parseYamlMap(field);
  for (const [target, source] of mapValues) {
    if (!target.startsWith("/")) continue;
    const normalizedSource = stripYamlScalar(source) || null;
    volumes.push({ type: normalizedSource?.startsWith("/") || normalizedSource?.startsWith(".") ? "bind" : "volume", source: normalizedSource, target, mode: null });
  }
  return uniqueVolumes(volumes);
}

function parseComposeEnvironment(field?: ComposeField): DockerEnvironmentVariable[] {
  if (!field) return [];
  const values: DockerEnvironmentVariable[] = [];
  for (const item of parseYamlList(field)) {
    const scalar = stripYamlScalar(item);
    const equals = scalar.indexOf("=");
    values.push({ name: (equals < 0 ? scalar : scalar.slice(0, equals)).trim(), value: equals < 0 ? "" : scalar.slice(equals + 1) });
  }
  for (const [name, value] of parseYamlMap(field)) values.push({ name, value: stripYamlScalar(value) });
  return uniqueEnvironment(values);
}

function parseYamlList(field: ComposeField): string[] {
  return parseYamlListEntries(field).map((entry) => entry.value).filter(Boolean);
}

type ComposeListEntry = { value: string; lines: string[]; indent: number };

function parseYamlListEntries(field: ComposeField): ComposeListEntry[] {
  const inlineList = parseInlineYamlList(field.value);
  if (inlineList) return inlineList.map((value) => ({ value, lines: [], indent: field.indent + 1 }));
  const childIndent = firstChildIndent(field.lines, field.indent);
  if (childIndent === null) return [];
  const entries: ComposeListEntry[] = [];
  for (const line of field.lines) {
    const indent = line.search(/\S/);
    if (indent === childIndent && /^\s*-\s*/.test(line)) {
      entries.push({ value: line.replace(/^\s*-\s*/, "").trim(), lines: [], indent: childIndent });
    } else if (entries.length && (indent > childIndent || !line.trim() || /^\s*#/.test(line))) {
      entries[entries.length - 1].lines.push(line);
    }
  }
  return entries;
}

function parseYamlEntryMap(entry: ComposeListEntry): Record<string, string> {
  const values: Record<string, string> = {};
  const first = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(entry.value);
  if (first) values[first[1]] = first[2];
  const childIndent = firstChildIndent(entry.lines, entry.indent);
  if (childIndent === null) return values;
  for (const line of entry.lines) {
    if (line.search(/\S/) !== childIndent) continue;
    const match = /^\s*([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function parseYamlMap(field: ComposeField): [string, string][] {
  const inlineMap = parseInlineYamlMap(field.value);
  if (inlineMap) return inlineMap;
  const childIndent = firstChildIndent(field.lines, field.indent);
  if (childIndent === null) return [];
  return field.lines.filter((line) => line.search(/\S/) === childIndent && !/^\s*-\s*/.test(line))
    .map((line) => /^\s*([^:#][^:]*):\s*(.*?)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => [match[1].trim(), match[2]]);
}

function parseYamlMapKeys(field: ComposeField) {
  return [...new Set(parseYamlMap(field).map(([key]) => key).filter(Boolean))].sort();
}

function firstChildIndent(lines: string[], parentIndent: number) {
  return lines.map((line) => line.trim() && !/^\s*#/.test(line) ? line.search(/\S/) : -1)
    .filter((indent) => indent > parentIndent).sort((left, right) => left - right)[0] ?? null;
}

function parseComposeScalar(value?: string) {
  if (value === undefined) return null;
  const scalar = stripYamlScalar(value);
  return !scalar || scalar === "null" || scalar === "~" ? null : scalar;
}

function parseComposePortNumber(value?: string) {
  const scalar = parseComposeScalar(value);
  if (scalar === null) return null;
  const number = Number(scalar);
  return Number.isInteger(number) && number >= 0 && number <= 65_535 ? number : null;
}

function normalizeComposeProtocol(value?: string): DockerPort["protocol"] {
  const protocol = parseComposeScalar(value);
  return protocol === "udp" ? "udp" : protocol === "sctp" ? "sctp" : "tcp";
}

function parseInlineYamlList(value: string) {
  const scalar = value.trim();
  if (!scalar.startsWith("[") || !scalar.endsWith("]")) return null;
  return splitInlineYaml(scalar.slice(1, -1)).map((item) => item.trim()).filter(Boolean);
}

function parseInlineYamlMap(value: string): [string, string][] | null {
  const scalar = value.trim();
  if (!scalar.startsWith("{") || !scalar.endsWith("}")) return null;
  return splitInlineYaml(scalar.slice(1, -1)).map((item) => {
    const separator = item.indexOf(":");
    return separator < 0 ? null : [stripYamlScalar(item.slice(0, separator)), item.slice(separator + 1).trim()] as [string, string];
  }).filter((item): item is [string, string] => Boolean(item?.[0]));
}

function splitInlineYaml(value: string) {
  const values: string[] = [];
  let start = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "'" || character === '"') && value[index - 1] !== "\\") quote = quote === character ? "" : quote || character;
    if (character === "," && !quote) {
      values.push(value.slice(start, index));
      start = index + 1;
    }
  }
  values.push(value.slice(start));
  return values;
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
  return uniquePorts(ports);
}

function normalizeDockerNetworks(value: JsonRecord | null): string[] {
  return value ? Object.keys(value).sort() : [];
}

function normalizeDockerVolumes(value: unknown): DockerVolume[] {
  if (!Array.isArray(value)) return [];
  const volumes: DockerVolume[] = [];
  for (const item of value) {
    const mount = asRecord(item);
    const target = readString(mount?.Destination) || readString(mount?.Target);
    if (!target) continue;
    const rawType = readString(mount?.Type);
    const type: DockerVolume["type"] = rawType === "bind" || rawType === "volume" || rawType === "tmpfs" ? rawType : "unknown";
    const mode = readString(mount?.Mode) || (mount?.RW === false ? "ro" : mount?.RW === true ? "rw" : null);
    volumes.push({ type, source: readString(mount?.Source), target, mode });
  }
  return uniqueVolumes(volumes);
}

function normalizeDockerEnvironment(value: unknown): DockerEnvironmentVariable[] {
  if (!Array.isArray(value)) return [];
  return uniqueEnvironment(value.flatMap((item) => {
    if (typeof item !== "string" || !item.trim()) return [];
    const equals = item.indexOf("=");
    return [{ name: (equals < 0 ? item : item.slice(0, equals)).trim(), value: equals < 0 ? "" : item.slice(equals + 1) }];
  }));
}

function uniquePorts(ports: DockerPort[]) {
  const unique = new Map<string, DockerPort>();
  for (const port of ports) {
    const normalizedPort = isWildcardHost(port.hostIp) ? { ...port, hostIp: "0.0.0.0" } : port;
    unique.set([normalizedPort.containerPort, normalizedPort.protocol, normalizedPort.hostIp || "", normalizedPort.hostPort ?? ""].join(":"), normalizedPort);
  }
  return [...unique.values()].sort((left, right) => left.containerPort - right.containerPort || (left.hostPort ?? 0) - (right.hostPort ?? 0));
}

function isWildcardHost(value: string | null) {
  return value === "0.0.0.0" || value === "::" || value === "[::]";
}

function uniqueVolumes(volumes: DockerVolume[]) {
  const unique = new Map<string, DockerVolume>();
  for (const volume of volumes) unique.set([volume.type, volume.source || "", volume.target, volume.mode || ""].join(":"), volume);
  return [...unique.values()].sort((left, right) => left.target.localeCompare(right.target));
}

function uniqueEnvironment(environment: DockerEnvironmentVariable[]) {
  const unique = new Map<string, DockerEnvironmentVariable>();
  for (const variable of environment) {
    if (variable.name) unique.set(variable.name, { ...variable, value: redactEnvironmentValue(variable.name, variable.value) });
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function redactEnvironmentValue(name: string, value: string) {
  return /(?:pass(?:word|wd)?|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|credential|auth)/i.test(name)
    ? "<redacted>"
    : value;
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
  return Number.isInteger(number) && number >= 0 && number <= 65_535 ? number : null;
}
function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString();
  if (typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
  return null;
}
function normalizeIndex(value: string) { return value.startsWith("/") ? value : `/${value}`; }
function stripYamlScalar(value: string) {
  const trimmed = value.trim();
  let end = trimmed.length;
  let quote = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if ((character === "'" || character === '"') && trimmed[index - 1] !== "\\") quote = quote === character ? "" : quote || character;
    if (character === "#" && !quote && (index === 0 || /\s/.test(trimmed[index - 1]))) {
      end = index;
      break;
    }
  }
  const scalar = trimmed.slice(0, end).trim();
  return scalar.length >= 2 && ((scalar.startsWith('"') && scalar.endsWith('"')) || (scalar.startsWith("'") && scalar.endsWith("'")))
    ? scalar.slice(1, -1)
    : scalar;
}
function asRecord(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "the Docker Engine returned an unexpected error"; }
