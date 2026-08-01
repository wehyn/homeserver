import type {
  DockerContainer,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerHealthState,
  DockerPort,
  DockerResourceUsage,
} from "./docker-discovery-types.ts";

type JsonRecord = Record<string, unknown>;

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type DockerDiscoveryOptions = {
  discoveryUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

const DEFAULT_TIMEOUT_MS = 2_500;

export async function collectDockerSnapshot(options: DockerDiscoveryOptions = {}): Promise<DockerDiscoveryResponse> {
  const baseUrl = normalizeDiscoveryUrl(options.discoveryUrl ?? process.env.DOCKER_DISCOVERY_URL ?? "");
  if (!baseUrl) {
    return createUnavailableDockerDiscovery(
      "Docker discovery is not configured; no Docker socket is mounted in the metrics agent.",
    );
  }

  const fetcher = options.fetcher || fetch;
  const token = options.token ?? process.env.DOCKER_DISCOVERY_TOKEN ?? "";
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  let summaries: unknown[];

  try {
    const payload = await requestJson(fetcher, `${baseUrl}/containers/json?all=true`, token, timeoutMs);
    summaries = parseDockerContainerList(payload);
  } catch (error) {
    return createUnavailableDockerDiscovery(`Docker discovery is unavailable: ${getErrorMessage(error)}.`);
  }

  const warnings: string[] = [];
  const containers: DockerContainer[] = [];
  await Promise.all(summaries.map(async (summary) => {
    const id = readString(asRecord(summary)?.Id);
    if (!id) {
      warnings.push("Docker returned a container without an id; it was omitted.");
      return;
    }

    let inspect: unknown;
    try {
      inspect = await requestJson(fetcher, `${baseUrl}/containers/${encodeURIComponent(id)}/json`, token, timeoutMs);
    } catch {
      warnings.push(`Metadata is unavailable for Docker container ${id.slice(0, 12)}.`);
    }

    let stats: unknown;
    const inspectState = asRecord(asRecord(inspect)?.State);
    const state = normalizeDockerState(readString(inspectState?.Status) || readString(asRecord(summary)?.State));
    if (state === "running") {
      try {
        stats = await requestJson(
          fetcher,
          `${baseUrl}/containers/${encodeURIComponent(id)}/stats?stream=false`,
          token,
          timeoutMs,
        );
      } catch {
        warnings.push(`Resource usage is unavailable for Docker container ${id.slice(0, 12)}.`);
      }
    }

    const container = normalizeDockerContainer(summary, inspect, stats);
    if (container) containers.push(container);
    else warnings.push(`Docker container ${id.slice(0, 12)} could not be normalized; it was omitted.`);
  }));

  const uniqueWarnings = [...new Set(warnings)].sort();
  return {
    schemaVersion: 1,
    available: true,
    status: uniqueWarnings.length ? "partial" : "available",
    source: "read-only-agent",
    containers: containers.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    warnings: uniqueWarnings,
    updatedAt: new Date().toISOString(),
  };
}

export function createUnavailableDockerDiscovery(warning: string): DockerDiscoveryResponse {
  return {
    schemaVersion: 1,
    available: false,
    status: "unavailable",
    source: "unavailable",
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
  inspect?: unknown,
  stats?: unknown,
): DockerContainer | null {
  const summaryRecord = asRecord(summary);
  const inspectRecord = asRecord(inspect);
  if (!summaryRecord && !inspectRecord) return null;

  const id = readString(summaryRecord?.Id) || readString(inspectRecord?.Id);
  if (!id) return null;

  const config = asRecord(inspectRecord?.Config);
  const stateRecord = asRecord(inspectRecord?.State);
  const labels = {
    ...readLabels(summaryRecord?.Labels),
    ...readLabels(config?.Labels),
  };
  const publicLabels = filterPublicLabels(labels);
  const names = readStringArray(summaryRecord?.Names)
    .map((name) => name.replace(/^\/+/, "").trim())
    .filter(Boolean);
  const inspectName = readString(inspectRecord?.Name)?.replace(/^\/+/, "").trim();
  const name = inspectName || names[0] || id.slice(0, 12);
  const image = readString(summaryRecord?.Image) || readString(config?.Image);
  const stateValue = readString(stateRecord?.Status) || readString(summaryRecord?.State);
  const hasInspectState = Boolean(stateRecord);
  const health = normalizeDockerHealth(stateRecord?.Health, hasInspectState);
  const ports = normalizeDockerPorts(
    summaryRecord?.Ports,
    asRecord(asRecord(inspectRecord?.NetworkSettings)?.Ports),
  );

  return {
    id,
    name,
    image,
    compose: {
      project: publicLabels["com.docker.compose.project"] || null,
      service: publicLabels["com.docker.compose.service"] || null,
    },
    labels: publicLabels,
    state: normalizeDockerState(stateValue),
    statusText: readString(summaryRecord?.Status),
    health,
    ports,
    resources: normalizeDockerStats(stats),
    createdAt: normalizeTimestamp(inspectRecord?.Created ?? summaryRecord?.Created),
    startedAt: normalizeTimestamp(stateRecord?.StartedAt),
  };
}

export function normalizeDockerStats(value: unknown): DockerResourceUsage | null {
  const stats = asRecord(value);
  if (!stats) return null;

  const cpuStats = asRecord(stats.cpu_stats);
  const previousCpuStats = asRecord(stats.precpu_stats);
  const cpuUsage = asRecord(cpuStats?.cpu_usage);
  const previousCpuUsage = asRecord(previousCpuStats?.cpu_usage);
  const cpuDelta = difference(readNumber(cpuUsage?.total_usage), readNumber(previousCpuUsage?.total_usage));
  const systemDelta = difference(readNumber(cpuStats?.system_cpu_usage), readNumber(previousCpuStats?.system_cpu_usage));
  const onlineCpus = readNumber(cpuStats?.online_cpus)
    || readNumberArray(cpuUsage?.percpu_usage).length
    || null;
  const cpuPercent = cpuDelta !== null && systemDelta !== null && systemDelta > 0 && onlineCpus
    ? roundPercent((cpuDelta / systemDelta) * onlineCpus * 100)
    : null;

  const memoryStats = asRecord(stats.memory_stats);
  const memoryUsageBytes = readNumber(memoryStats?.usage);
  const memoryLimitBytes = readNumber(memoryStats?.limit);
  const memoryPercent = memoryUsageBytes !== null && memoryLimitBytes !== null && memoryLimitBytes > 0
    ? roundPercent((memoryUsageBytes / memoryLimitBytes) * 100)
    : null;

  const networkTotals = sumNetworkBytes(stats.networks);
  const pids = readNumber(asRecord(stats.pids_stats)?.current);
  const resources: DockerResourceUsage = {
    cpuPercent,
    memoryUsageBytes,
    memoryLimitBytes,
    memoryPercent,
    networkRxBytes: networkTotals.rxBytes,
    networkTxBytes: networkTotals.txBytes,
    pids,
  };

  return Object.values(resources).some((resource) => resource !== null) ? resources : null;
}

export function normalizeDockerState(value: string | null): DockerContainerState {
  switch (value?.toLowerCase()) {
    case "created":
    case "restarting":
    case "running":
    case "removing":
    case "paused":
    case "exited":
    case "dead":
      return value.toLowerCase() as DockerContainerState;
    default:
      return "unknown";
  }
}

function normalizeDockerHealth(value: unknown, hasInspectState: boolean): DockerHealthState {
  const health = asRecord(value);
  switch (readString(health?.Status)?.toLowerCase()) {
    case "healthy":
      return "healthy";
    case "unhealthy":
      return "unhealthy";
    case "starting":
      return "starting";
    default:
      return hasInspectState ? "none" : "unknown";
  }
}

function normalizeDockerPorts(...values: unknown[]): DockerPort[] {
  const ports: DockerPort[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const port = normalizePublishedPort(item);
        if (port) ports.push(port);
      }
      continue;
    }

    const record = asRecord(value);
    if (!record) continue;
    for (const [key, bindings] of Object.entries(record)) {
      const [containerPortValue, protocolValue] = key.split("/");
      const containerPort = readNumber(containerPortValue);
      if (containerPort === null) continue;
      const protocol = normalizeProtocol(protocolValue);
      if (!Array.isArray(bindings) || bindings.length === 0) {
        ports.push({ containerPort, protocol, hostIp: null, hostPort: null });
        continue;
      }
      for (const binding of bindings) {
        const bindingRecord = asRecord(binding);
        ports.push({
          containerPort,
          protocol,
          hostIp: readString(bindingRecord?.HostIp) || null,
          hostPort: readNumber(bindingRecord?.HostPort),
        });
      }
    }
  }

  const unique = new Map<string, DockerPort>();
  for (const port of ports) {
    const key = [port.containerPort, port.protocol, port.hostIp || "", port.hostPort ?? ""].join(":");
    unique.set(key, port);
  }
  return [...unique.values()].sort((left, right) => left.containerPort - right.containerPort
    || left.protocol.localeCompare(right.protocol)
    || (left.hostPort ?? 0) - (right.hostPort ?? 0));
}

function normalizePublishedPort(value: unknown): DockerPort | null {
  const record = asRecord(value);
  if (!record) return null;
  const containerPort = readNumber(record.PrivatePort);
  if (containerPort === null) return null;
  return {
    containerPort,
    protocol: normalizeProtocol(readString(record.Type)),
    hostIp: readString(record.IP) || null,
    hostPort: readNumber(record.PublicPort),
  };
}

function normalizeProtocol(value: string | null): DockerPort["protocol"] {
  switch (value?.toLowerCase()) {
    case "tcp":
    case "udp":
    case "sctp":
      return value.toLowerCase() as DockerPort["protocol"];
    default:
      return "unknown";
  }
}

function sumNetworkBytes(value: unknown) {
  const networks = asRecord(value);
  let rxBytes = 0;
  let txBytes = 0;
  let hasRxBytes = false;
  let hasTxBytes = false;
  for (const network of Object.values(networks || {})) {
    const record = asRecord(network);
    const rx = readNumber(record?.rx_bytes);
    const tx = readNumber(record?.tx_bytes);
    if (rx !== null) {
      rxBytes += rx;
      hasRxBytes = true;
    }
    if (tx !== null) {
      txBytes += tx;
      hasTxBytes = true;
    }
  }
  return {
    rxBytes: hasRxBytes ? rxBytes : null,
    txBytes: hasTxBytes ? txBytes : null,
  };
}

function normalizeDiscoveryUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!(["http:", "https:"].includes(url.protocol)) || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function requestJson(fetcher: Fetcher, url: string, token: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "GET",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`read-only adapter returned HTTP ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readLabels(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).filter(([, item]) => typeof item === "string")) as Record<string, string>;
}

function filterPublicLabels(labels: Record<string, string>) {
  const allowed = new Set(["com.docker.compose.project", "com.docker.compose.service", "com.nimbus.app-id"]);
  return Object.fromEntries(Object.entries(labels).filter(([key]) => allowed.has(key)));
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }
  return null;
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(readNumber).filter((item): item is number => item !== null) : [];
}

function difference(left: number | null, right: number | null) {
  return left !== null && right !== null ? Math.max(0, left - right) : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }
  return null;
}

function roundPercent(value: number) {
  return Number(Math.max(0, value).toFixed(2));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "the adapter returned an unexpected error";
}
