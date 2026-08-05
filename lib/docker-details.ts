import type { DockerComposeService, DockerContainer } from "@/agent/docker-discovery-types";
import type { DockerAppDetails, ManagedApp } from "@/lib/types";

export function resolveDockerDetails(
  app: ManagedApp,
  containers: DockerContainer[],
  composeServices: DockerComposeService[] = [],
): DockerAppDetails | undefined {
  const container = findContainer(app, containers);
  const composeService = findComposeService(app, composeServices);
  if (!container && !composeService) return undefined;

  const composeDetails = composeService?.details;
  return {
    source: container ? "container" : "compose",
    image: container?.image || app.containerImage || composeDetails?.image || null,
    networks: preferValues(container?.networks, composeDetails?.networks),
    ports: preferValues(container?.ports, composeDetails?.ports),
    volumes: preferValues(container?.volumes, composeDetails?.volumes),
    environment: preferValues(container?.environment, composeDetails?.environment),
  };
}

function findContainer(app: ManagedApp, containers: DockerContainer[]) {
  if (app.containerId) {
    const byId = containers.find((container) => container.id === app.containerId);
    if (byId) return byId;
  }

  const candidates = containers.filter((container) => {
    if (app.dockerProject && container.compose.project !== app.dockerProject) return false;
    if (app.dockerService && container.compose.service !== app.dockerService) return false;
    return true;
  });
  if (app.dockerProject || app.dockerService) {
    if (candidates.length === 1) return candidates[0];
    return findUnique(candidates, app);
  }

  const named = findUnique(containers, app);
  if (named) return named;
  return findByUrlPort(app, containers, (container) => container.ports);
}

function findComposeService(app: ManagedApp, services: DockerComposeService[]) {
  if (app.dockerProject && app.dockerService) {
    const explicit = services.find((service) => service.project === app.dockerProject && service.service === app.dockerService);
    if (explicit) return explicit;
  }

  let candidates = services;
  if (app.dockerProject) candidates = candidates.filter((service) => service.project === app.dockerProject);
  if (app.dockerService) candidates = candidates.filter((service) => service.service === app.dockerService);
  if (app.dockerProject || app.dockerService) return candidates.length === 1 ? candidates[0] : findUniqueComposeService(candidates, app);

  const named = findUniqueComposeService(services, app);
  if (named) return named;
  return findByUrlPort(app, services, (service) => service.details.ports);
}

function findUnique(candidates: DockerContainer[], app: ManagedApp) {
  const identifiers = new Set([app.id, app.name, app.containerName].map((value) => normalizeIdentifier(value || "")).filter(Boolean));
  const exact = candidates.filter((container) => [
    container.name,
    container.compose.project,
    container.compose.service,
    container.labels["com.nimbus.app-id"],
  ].some((value) => value && identifiers.has(normalizeIdentifier(value))));
  if (exact.length === 1) return exact[0];

  const loose = candidates.filter((container) => [
    container.name,
    container.compose.project,
    container.compose.service,
  ].some((value) => {
    const normalized = normalizeIdentifier(value || "");
    return normalized && [...identifiers].some((identifier) => normalized.startsWith(identifier) || identifier.startsWith(normalized));
  }));
  return loose.length === 1 ? loose[0] : undefined;
}

function findUniqueComposeService(candidates: DockerComposeService[], app: ManagedApp) {
  const identifiers = new Set([app.id, app.name, app.containerName].map((value) => normalizeIdentifier(value || "")).filter(Boolean));
  const exact = candidates.filter((service) => [service.project, service.service].some((value) => identifiers.has(normalizeIdentifier(value))));
  if (exact.length === 1) return exact[0];

  const loose = candidates.filter((service) => [service.project, service.service].some((value) => {
    const normalized = normalizeIdentifier(value);
    return normalized && [...identifiers].some((identifier) => normalized.startsWith(identifier) || identifier.startsWith(normalized));
  }));
  return loose.length === 1 ? loose[0] : undefined;
}

function findByUrlPort<T>(app: ManagedApp, candidates: T[], getPorts: (candidate: T) => { hostPort: number | null }[]) {
  const port = readUrlPort(app.url);
  if (port === null) return undefined;
  const matches = candidates.filter((candidate) => getPorts(candidate).some((entry) => entry.hostPort === port));
  return matches.length === 1 ? matches[0] : undefined;
}

function preferValues<T>(primary?: T[], fallback?: T[]) {
  return primary?.length ? primary : fallback || [];
}

function readUrlPort(value: string) {
  try {
    const url = new URL(value);
    const numericPort = url.port ? Number(url.port) : url.protocol === "http:" ? 80 : url.protocol === "https:" ? 443 : NaN;
    return Number.isInteger(numericPort) ? numericPort : null;
  } catch {
    return null;
  }
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
