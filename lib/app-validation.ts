import type { AppSource, AppStatus, ManagedApp } from "./types";

const appStatuses: AppStatus[] = ["online", "degraded", "offline", "unknown"];
const appSources: AppSource[] = ["manual", "docker"];
const containerStates = ["created", "restarting", "running", "removing", "paused", "exited", "dead", "unknown"];
const containerHealthStates = ["healthy", "unhealthy", "starting", "none", "unknown"];
const optionalStringFields = [
  "icon", "healthUrl", "dockerProject", "dockerService", "containerId", "containerName", "containerImage",
  "containerState", "containerHealth", "containerStartedAt", "containerObservedAt", "casaosHostname", "casaosPortMap", "casaosIndex",
] as const;

export function parseManagedAppPayload(value: unknown): ManagedApp | null {
  if (!isRecord(value)) return null;
  const source = value.source === undefined ? "manual" : value.source;
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const icon = typeof value.icon === "string" ? value.icon.trim() : undefined;
  const healthUrl = typeof value.healthUrl === "string" ? value.healthUrl.trim() : undefined;
  if (
    !isNonEmptyString(value.id) || !isNonEmptyString(value.name) || typeof value.description !== "string"
    || !isNonEmptyString(value.category) || !isWebUrl(url) || !isHexColor(value.color)
    || !isOneOf(value.status, appStatuses) || !isOneOf(source, appSources) || typeof value.isFavorite !== "boolean"
    || typeof value.isVisible !== "boolean" || typeof value.sortOrder !== "number" || !Number.isInteger(value.sortOrder)
    || (value.allowInsecureTls !== undefined && typeof value.allowInsecureTls !== "boolean")
    || (value.casaosScheme !== undefined && value.casaosScheme !== "http" && value.casaosScheme !== "https")
    || optionalStringFields.some((field) => value[field] !== undefined && typeof value[field] !== "string")
    || (icon !== undefined && icon !== "" && !isWebUrl(icon))
    || (healthUrl !== undefined && healthUrl !== "" && !isWebUrl(healthUrl))
    || (value.containerState !== undefined && !containerStates.includes(String(value.containerState)))
    || (value.containerHealth !== undefined && !containerHealthStates.includes(String(value.containerHealth)))
  ) return null;

  return {
    ...value,
    id: String(value.id).trim(),
    name: String(value.name).trim(),
    category: String(value.category).trim(),
    url,
    icon,
    healthUrl,
    color: String(value.color).trim(),
    source,
  } as ManagedApp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function isOneOf<T extends string>(value: unknown, values: T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}
