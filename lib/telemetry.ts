import "server-only";

import { getDatabase } from "./db";
import { fetchDockerDiscovery, type DockerContainer } from "./docker-discovery";
import { markMissingDockerContainerStates, recordContainerState } from "./service-operations";
import type { HostTelemetrySnapshot } from "@/agent/host-telemetry";
import type { DockerContainerTelemetry, DockerResourcePoint, TelemetryResponse } from "./telemetry-types";

const DEFAULT_AGENT_URL = "http://metrics-agent:8787";
const REQUEST_TIMEOUT_MS = 2_500;
const RESOURCE_HISTORY_LIMIT = 240;

export async function getTelemetrySnapshot(): Promise<TelemetryResponse> {
  const [hostResult, docker] = await Promise.all([fetchHostTelemetry(), fetchDockerDiscovery()]);
  const warnings = [...docker.warnings];
  if (hostResult.warning) warnings.push(hostResult.warning);
  if (hostResult.snapshot?.warnings.length) warnings.push(...hostResult.snapshot.warnings);
  if (docker.available) {
    recordDockerResources(docker.containers);
    recordDockerContainerStates(docker.containers);
    if (docker.status === "available") markMissingDockerContainerStates(docker.containers.map(containerServiceId));
  }
  const containers = docker.containers.map((container) => ({
    ...container,
    history: listDockerResourceHistory(container.id),
  }));
  const hostAvailable = Boolean(hostResult.snapshot?.available);
  const status = hostAvailable && docker.available
    && hostResult.snapshot?.status === "available"
    && docker.status === "available"
    ? "available"
    : hostAvailable || docker.available ? "partial" : "unavailable";
  return {
    schemaVersion: 1,
    status,
    host: hostResult.snapshot,
    docker,
    containers,
    warnings: [...new Set(warnings)],
    updatedAt: new Date().toISOString(),
  };
}

async function fetchHostTelemetry(): Promise<{ snapshot: HostTelemetrySnapshot | null; warning?: string }> {
  const agentUrl = normalizeAgentUrl(process.env.DOCKER_AGENT_URL || process.env.MEMORY_AGENT_URL || DEFAULT_AGENT_URL);
  if (!agentUrl) return { snapshot: null, warning: "The host telemetry agent URL is invalid." };
  const token = process.env.DOCKER_AGENT_TOKEN || process.env.MEMORY_AGENT_TOKEN;
  try {
    const response = await fetch(`${agentUrl}/v1/host/telemetry`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { snapshot: null, warning: `The host telemetry agent is unavailable (HTTP ${response.status}).` };
    const payload: unknown = await response.json();
    if (!isHostTelemetrySnapshot(payload)) return { snapshot: null, warning: "The host telemetry agent returned invalid data." };
    return { snapshot: payload };
  } catch {
    return { snapshot: null, warning: "The host telemetry agent is unavailable." };
  }
}

function recordDockerResources(containers: DockerContainer[]) {
  const database = getDatabase();
  const observedAt = new Date().toISOString();
  const insert = database.prepare(`INSERT INTO docker_resource_history
    (container_id, service_id, container_name, observed_at, cpu_percent, memory_usage_bytes, memory_limit_bytes,
      memory_percent, network_rx_bytes, network_tx_bytes, pids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const prune = database.prepare(`DELETE FROM docker_resource_history
    WHERE container_id = ? AND id NOT IN (
      SELECT id FROM docker_resource_history WHERE container_id = ?
      ORDER BY observed_at DESC, id DESC LIMIT ?
    )`);
  for (const container of containers) {
    if (!container.resources) continue;
    const serviceId = containerServiceId(container);
    const resources = container.resources;
    insert.run(
      container.id,
      serviceId,
      container.name,
      observedAt,
      resources.cpuPercent,
      resources.memoryUsageBytes,
      resources.memoryLimitBytes,
      resources.memoryPercent,
      resources.networkRxBytes,
      resources.networkTxBytes,
      resources.pids,
    );
    prune.run(container.id, container.id, RESOURCE_HISTORY_LIMIT);
  }
}

function recordDockerContainerStates(containers: DockerContainer[]) {
  for (const container of containers) {
    const serviceId = containerServiceId(container);
    recordContainerState({
      serviceId,
      state: container.state === "removing" ? "unknown" : container.state,
      healthStatus: container.health,
      containerId: container.id,
      containerName: container.name,
      image: container.image || undefined,
      startedAt: container.startedAt || undefined,
      source: "docker-agent",
    });
  }
}

function containerServiceId(container: DockerContainer) {
  const candidate = container.labels["com.nimbus.app-id"] || container.compose.service || container.name;
  return candidate.length <= 160 ? candidate : container.id;
}

function listDockerResourceHistory(containerId: string): DockerResourcePoint[] {
  const rows = getDatabase().prepare(`SELECT observed_at, cpu_percent, memory_usage_bytes, memory_limit_bytes,
    memory_percent, network_rx_bytes, network_tx_bytes, pids
    FROM docker_resource_history WHERE container_id = ? ORDER BY observed_at ASC, id ASC LIMIT ?`).all(containerId, RESOURCE_HISTORY_LIMIT) as Record<string, unknown>[];
  return rows.map((row) => ({
    observedAt: String(row.observed_at),
    cpuPercent: nullableNumber(row.cpu_percent),
    memoryUsageBytes: nullableNumber(row.memory_usage_bytes),
    memoryLimitBytes: nullableNumber(row.memory_limit_bytes),
    memoryPercent: nullableNumber(row.memory_percent),
    networkRxBytes: nullableNumber(row.network_rx_bytes),
    networkTxBytes: nullableNumber(row.network_tx_bytes),
    pids: nullableNumber(row.pids),
  }));
}

function isHostTelemetrySnapshot(value: unknown): value is HostTelemetrySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<HostTelemetrySnapshot>;
  return snapshot.schemaVersion === 1
    && typeof snapshot.available === "boolean"
    && ["available", "partial", "unavailable"].includes(String(snapshot.status))
    && Array.isArray(snapshot.temperatures)
    && Array.isArray(snapshot.network)
    && Array.isArray(snapshot.disks)
    && Array.isArray(snapshot.raid)
    && Boolean(snapshot.ups)
    && Array.isArray(snapshot.warnings)
    && typeof snapshot.updatedAt === "string";
}

function normalizeAgentUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
