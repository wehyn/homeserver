import type {
  CasaOSWebUI,
  DockerContainer,
  DockerComposeService,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerHealthState,
} from "@/agent/docker-discovery-types";

export type {
  CasaOSWebUI,
  DockerContainer,
  DockerComposeService,
  DockerContainerState,
  DockerDiscoveryResponse,
  DockerHealthState,
} from "@/agent/docker-discovery-types";

export async function fetchDockerDiscovery(): Promise<DockerDiscoveryResponse> {
  const configuredAgentUrl = process.env.DOCKER_AGENT_URL || "";
  if (!configuredAgentUrl) return unavailable("Docker discovery is not configured.");
  const agentUrl = normalizeAgentUrl(configuredAgentUrl);
  if (!agentUrl) return unavailable("The Docker discovery agent URL is invalid.");
  const token = process.env.DOCKER_AGENT_TOKEN || process.env.MEMORY_AGENT_TOKEN || "";
  try {
    const response = await fetch(`${agentUrl}/v1/docker/containers`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok) return unavailable(`The Docker discovery agent is unavailable (HTTP ${response.status}).`);
    if (!isDockerDiscoveryResponse(payload)) return unavailable("The Docker discovery agent returned invalid data.");
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
    && (response.servicesRoot === null || typeof response.servicesRoot === "string")
    && Array.isArray(response.containers)
    && response.containers.every(isDockerContainer)
    && (response.composeServices === undefined || (Array.isArray(response.composeServices) && response.composeServices.every(isDockerComposeService)))
    && Array.isArray(response.warnings)
    && response.warnings.every((warning) => typeof warning === "string")
    && typeof response.updatedAt === "string";
}

function isDockerComposeService(value: unknown): value is DockerComposeService {
  const service = asRecord(value);
  const details = asRecord(service?.details);
  return typeof service?.project === "string"
    && typeof service.service === "string"
    && (service.casaos === null || isCasaOSWebUI(service.casaos))
    && Boolean(details)
    && (typeof details?.image === "string" || details?.image === null)
    && Array.isArray(details?.networks)
    && details.networks.every((network) => typeof network === "string")
    && Array.isArray(details?.ports)
    && details.ports.every(isDockerPort)
    && Array.isArray(details?.volumes)
    && details.volumes.every(isDockerVolume)
    && Array.isArray(details?.environment)
    && details.environment.every(isDockerEnvironmentVariable);
}

function isDockerContainer(value: unknown): value is DockerContainer {
  const container = asRecord(value);
  const compose = asRecord(container?.compose);
  const labels = asRecord(container?.labels);
  const casaos = container?.casaos;
  return typeof container?.id === "string"
    && typeof container.name === "string"
    && (typeof container.image === "string" || container.image === null)
    && (typeof compose?.project === "string" || compose?.project === null)
    && (typeof compose?.service === "string" || compose?.service === null)
    && Boolean(labels)
    && Object.values(labels || {}).every((label) => typeof label === "string")
    && isDockerState(container.state)
    && (typeof container.statusText === "string" || container.statusText === null)
    && isDockerHealth(container.health)
    && (casaos === null || isCasaOSWebUI(casaos))
    && Array.isArray(container.ports)
    && container.ports.every(isDockerPort)
    && isOptionalStringArray(container.networks)
    && isOptionalDockerVolumes(container.volumes)
    && isOptionalDockerEnvironment(container.environment)
    && (typeof container.createdAt === "string" || container.createdAt === null)
    && (typeof container.startedAt === "string" || container.startedAt === null);
}

function isCasaOSWebUI(value: unknown): value is CasaOSWebUI {
  const metadata = asRecord(value);
  return (metadata?.scheme === "http" || metadata?.scheme === "https")
    && typeof metadata.hostname === "string"
    && typeof metadata.portMap === "string"
    && typeof metadata.index === "string";
}

function isDockerPort(value: unknown) {
  const port = asRecord(value);
  return typeof port?.containerPort === "number" && Number.isInteger(port.containerPort) && port.containerPort >= 0 && port.containerPort <= 65_535
    && ["tcp", "udp", "sctp", "unknown"].includes(String(port.protocol))
    && (typeof port.hostIp === "string" || port.hostIp === null)
    && (port.hostPort === null || (typeof port.hostPort === "number" && Number.isInteger(port.hostPort) && port.hostPort >= 0 && port.hostPort <= 65_535));
}

function isOptionalStringArray(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isOptionalDockerVolumes(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every(isDockerVolume));
}

function isOptionalDockerEnvironment(value: unknown) {
  return value === undefined || (Array.isArray(value) && value.every(isDockerEnvironmentVariable));
}

function isDockerVolume(value: unknown) {
  const volume = asRecord(value);
  return ["bind", "volume", "tmpfs", "unknown"].includes(String(volume?.type))
    && (typeof volume?.source === "string" || volume?.source === null)
    && typeof volume?.target === "string"
    && (typeof volume?.mode === "string" || volume?.mode === null);
}

function isDockerEnvironmentVariable(value: unknown) {
  const variable = asRecord(value);
  return typeof variable?.name === "string" && typeof variable.value === "string";
}

function isDockerState(value: unknown): value is DockerContainerState {
  return ["created", "restarting", "running", "removing", "paused", "exited", "dead", "unknown"].includes(String(value));
}

function isDockerHealth(value: unknown): value is DockerHealthState {
  return ["healthy", "unhealthy", "starting", "none", "unknown"].includes(String(value));
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
    servicesRoot: null,
    containers: [],
    warnings: [warning],
    updatedAt: new Date().toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
