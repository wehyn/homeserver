import type {
  DockerContainer,
  DockerDiscoveryResponse,
  DockerHealthState,
  DockerPort,
  DockerResourceUsage,
} from "@/agent/docker-discovery-types";

export type {
  DockerContainer,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerDiscoveryStatus,
  DockerHealthState,
  DockerPort,
  DockerResourceUsage,
} from "@/agent/docker-discovery-types";

const DEFAULT_AGENT_URL = "http://metrics-agent:8787";

export async function fetchDockerDiscovery(): Promise<DockerDiscoveryResponse> {
  const agentUrl = normalizeAgentUrl(process.env.DOCKER_AGENT_URL || process.env.MEMORY_AGENT_URL || DEFAULT_AGENT_URL);
  if (!agentUrl) return unavailable("The Docker discovery agent URL is invalid.");

  const token = process.env.DOCKER_AGENT_TOKEN || process.env.MEMORY_AGENT_TOKEN || "";
  try {
    const response = await fetch(`${agentUrl}/v1/docker/containers`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2_500),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      return unavailable(`The Docker discovery agent is unavailable (HTTP ${response.status}).`);
    }
    if (!isDockerDiscoveryResponse(payload)) {
      return unavailable("The Docker discovery agent returned invalid data.");
    }
    return payload;
  } catch {
    return unavailable("The Docker discovery agent is unavailable.");
  }
}

export function isDockerDiscoveryResponse(value: unknown): value is DockerDiscoveryResponse {
  const response = asRecord(value);
  return response?.schemaVersion === 1
    && typeof response.available === "boolean"
    && (response.status === "available" || response.status === "partial" || response.status === "unavailable")
    && (response.source === "read-only-agent" || response.source === "unavailable")
    && Array.isArray(response.containers)
    && response.containers.every(isDockerContainer)
    && Array.isArray(response.warnings)
    && response.warnings.every((warning) => typeof warning === "string")
    && typeof response.updatedAt === "string";
}

function isDockerContainer(value: unknown): value is DockerContainer {
  const container = asRecord(value);
  const compose = asRecord(container?.compose);
  const labels = asRecord(container?.labels);
  const ports = container?.ports;
  return typeof container?.id === "string"
    && typeof container.name === "string"
    && isStringOrNull(container.image)
    && (typeof compose?.project === "string" || compose?.project === null)
    && (typeof compose?.service === "string" || compose?.service === null)
    && Boolean(labels)
    && Object.values(labels || {}).every((label) => typeof label === "string")
    && isDockerState(container.state)
    && isStringOrNull(container.statusText)
    && isDockerHealth(container.health)
    && Array.isArray(ports)
    && ports.every(isDockerPort)
    && (container.resources === null || isDockerResourceUsage(container.resources))
    && isStringOrNull(container.createdAt)
    && isStringOrNull(container.startedAt);
}

function isDockerPort(value: unknown): value is DockerPort {
  const port = asRecord(value);
  return typeof port?.containerPort === "number"
    && isDockerProtocol(port.protocol)
    && isStringOrNull(port.hostIp)
    && isNumberOrNull(port.hostPort);
}

function isDockerResourceUsage(value: unknown): value is DockerResourceUsage {
  const resources = asRecord(value);
  if (!resources) return false;
  return isNumberOrNull(resources.cpuPercent)
    && isNumberOrNull(resources.memoryUsageBytes)
    && isNumberOrNull(resources.memoryLimitBytes)
    && isNumberOrNull(resources.memoryPercent)
    && isNumberOrNull(resources.networkRxBytes)
    && isNumberOrNull(resources.networkTxBytes)
    && isNumberOrNull(resources.pids);
}

function isDockerState(value: unknown) {
  return ["created", "restarting", "running", "removing", "paused", "exited", "dead", "unknown"].includes(String(value));
}

function isDockerHealth(value: unknown): value is DockerHealthState {
  return ["healthy", "unhealthy", "starting", "none", "unknown"].includes(String(value));
}

function isDockerProtocol(value: unknown) {
  return ["tcp", "udp", "sctp", "unknown"].includes(String(value));
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

function unavailable(warning: string): DockerDiscoveryResponse {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}
