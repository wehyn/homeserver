import "server-only";

import { getDatabase } from "./db";
import type {
  AvailabilitySummary,
  BackupMetadataInput,
  ContainerStateInput,
  LatencySummary,
  ServiceBackupMetadata,
  ServiceContainerState,
  ServiceDependency,
  ServiceDependencyInput,
  ServiceLatencyObservation,
  ServiceObservationInput,
  ServiceOperations,
  ServiceStatus,
  ServiceStatusEvent,
} from "./service-operations-types";
import { backupStatuses, containerHealthStatuses, containerStates, serviceStatuses } from "./service-operations-types";

const DEFAULT_HISTORY_LIMIT = 120;
const MAX_HISTORY_LIMIT = 500;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 30;
const STATUS_HEARTBEAT_MS = 5 * 60 * 1000;

export type ServiceOperationsOptions = {
  historyLimit?: number;
  windowHours?: number;
};

export function recordServiceObservation(input: ServiceObservationInput) {
  const serviceId = requireId(input.serviceId, "serviceId");
  const status = requireEnum(input.status, serviceStatuses, "status");
  const observedAt = parseTimestamp(input.observedAt, "observedAt");
  const source = normalizeSource(input.source);
  const latencyMs = input.latencyMs === undefined ? null : requireNonNegativeInteger(input.latencyMs, "latencyMs");
  const database = getDatabase();
  const previous = database.prepare(`SELECT status, observed_at
    FROM service_status_history WHERE service_id = ? ORDER BY observed_at DESC, id DESC LIMIT 1`).get(serviceId) as { status?: string; observed_at?: string } | undefined;
  const previousStatus = previous?.status && serviceStatuses.includes(previous.status as ServiceStatus)
    ? previous.status as ServiceStatus
    : undefined;
  const previousTimestamp = previous?.observed_at ? Date.parse(previous.observed_at) : Number.NaN;
  const shouldRecordStatus = !previous
    || previous.status !== status
    || !Number.isFinite(previousTimestamp)
    || Date.parse(observedAt) - previousTimestamp >= STATUS_HEARTBEAT_MS;

  if (shouldRecordStatus) {
    database.prepare(`INSERT INTO service_status_history (service_id, status, latency_ms, observed_at, source, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(serviceId, status, latencyMs, observedAt, source, new Date().toISOString());
  }
  if (latencyMs !== null) {
    database.prepare(`INSERT INTO service_latency_observations (service_id, status, latency_ms, observed_at, source, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(serviceId, status, latencyMs, observedAt, source, new Date().toISOString());
  }

  return {
    observation: { serviceId, status, latencyMs: latencyMs ?? undefined, observedAt, source },
    previousStatus,
    statusTransitionRecorded: Boolean(previousStatus && shouldRecordStatus && previousStatus !== status),
    latencyObservationRecorded: latencyMs !== null,
  };
}

export function setServiceDependencies(serviceIdInput: string, dependencies: ServiceDependencyInput[]) {
  const serviceId = requireId(serviceIdInput, "serviceId");
  const normalized = dependencies.map((dependency) => ({
    serviceId,
    dependsOnServiceId: requireId(dependency.dependsOnServiceId, "dependsOnServiceId"),
    label: normalizeOptionalText(dependency.label, 160),
    critical: dependency.critical !== false,
  }));
  if (normalized.some((dependency) => dependency.serviceId === dependency.dependsOnServiceId)) {
    throw new Error("A service cannot depend on itself.");
  }
  const unique = [...new Map(normalized.map((dependency) => [dependency.dependsOnServiceId, dependency])).values()];
  const now = new Date().toISOString();
  const database = getDatabase();
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM service_dependencies WHERE service_id = ?").run(serviceId);
    const insert = database.prepare(`INSERT INTO service_dependencies
      (service_id, depends_on_service_id, label, is_critical, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    unique.forEach((dependency) => insert.run(
      serviceId,
      dependency.dependsOnServiceId,
      dependency.label ?? null,
      dependency.critical ? 1 : 0,
      now,
      now,
    ));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return listServiceDependencies(serviceId);
}

export function recordContainerState(input: ContainerStateInput) {
  const serviceId = requireId(input.serviceId, "serviceId");
  const state = requireEnum(input.state, containerStates, "state");
  const healthStatus = input.healthStatus === undefined ? "unknown" : requireEnum(input.healthStatus, containerHealthStatuses, "healthStatus");
  const restartCount = input.restartCount === undefined ? 0 : requireNonNegativeInteger(input.restartCount, "restartCount");
  const observedAt = parseTimestamp(input.observedAt, "observedAt");
  const source = normalizeSource(input.source || "agent");
  const containerId = normalizeOptionalText(input.containerId, 180);
  const containerName = normalizeOptionalText(input.containerName, 180);
  const image = normalizeOptionalText(input.image, 240);
  const startedAt = normalizeOptionalTimestamp(input.startedAt);
  const finishedAt = normalizeOptionalTimestamp(input.finishedAt);
  getDatabase().prepare(`INSERT INTO service_container_state
    (service_id, container_id, container_name, state, health_status, image, restart_count, started_at, finished_at, observed_at, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_id) DO UPDATE SET container_id = excluded.container_id,
      container_name = excluded.container_name, state = excluded.state, health_status = excluded.health_status,
      image = excluded.image, restart_count = excluded.restart_count, started_at = excluded.started_at,
      finished_at = excluded.finished_at, observed_at = excluded.observed_at, source = excluded.source,
      updated_at = excluded.updated_at`).run(
    serviceId,
    containerId ?? null,
    containerName ?? null,
    state,
    healthStatus,
    image ?? null,
    restartCount,
    startedAt ?? null,
    finishedAt ?? null,
    observedAt,
    source,
    new Date().toISOString(),
  );
  return getServiceContainerState(serviceId);
}

export function markMissingDockerContainerStates(observedServiceIds: string[]) {
  const uniqueServiceIds = [...new Set(observedServiceIds.map((serviceId) => requireId(serviceId, "serviceId")))];
  const now = new Date().toISOString();
  const database = getDatabase();
  const notInClause = uniqueServiceIds.length
    ? ` AND service_id NOT IN (${uniqueServiceIds.map(() => "?").join(", ")})`
    : "";
  database.prepare(`UPDATE service_container_state
    SET state = 'unknown', health_status = 'unknown', updated_at = ?
    WHERE source = 'docker-agent'${notInClause}`).run(now, ...uniqueServiceIds);
}

export function recordBackupMetadata(input: BackupMetadataInput) {
  const serviceId = requireId(input.serviceId, "serviceId");
  const status = requireEnum(input.status, backupStatuses, "status");
  const observedAt = parseTimestamp(input.observedAt, "observedAt");
  const lastBackupAt = normalizeOptionalTimestamp(input.lastBackupAt);
  const provider = normalizeOptionalText(input.provider, 120);
  const reference = normalizeOptionalText(input.reference, 240);
  const message = normalizeOptionalText(input.message, 500);
  const updatedAt = new Date().toISOString();
  getDatabase().prepare(`INSERT INTO service_backup_metadata
    (service_id, status, last_backup_at, provider, reference, message, observed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_id) DO UPDATE SET status = excluded.status, last_backup_at = excluded.last_backup_at,
      provider = excluded.provider, reference = excluded.reference, message = excluded.message,
      observed_at = excluded.observed_at, updated_at = excluded.updated_at`).run(
    serviceId,
    status,
    lastBackupAt ?? null,
    provider ?? null,
    reference ?? null,
    message ?? null,
    observedAt,
    updatedAt,
  );
  return getServiceBackupMetadata(serviceId);
}

export function getServiceOperations(serviceIdInput: string, options: ServiceOperationsOptions = {}): ServiceOperations {
  const serviceId = requireId(serviceIdInput, "serviceId");
  const historyLimit = boundedInteger(options.historyLimit, DEFAULT_HISTORY_LIMIT, 1, MAX_HISTORY_LIMIT);
  const windowHours = boundedInteger(options.windowHours, DEFAULT_WINDOW_HOURS, 1, MAX_WINDOW_HOURS);
  const database = getDatabase();
  const statusRows = database.prepare(`SELECT id, service_id, status, latency_ms, observed_at, source
    FROM service_status_history WHERE service_id = ? ORDER BY observed_at DESC, id DESC LIMIT ?`).all(serviceId, historyLimit) as Record<string, unknown>[];
  const latencyRows = database.prepare(`SELECT id, service_id, status, latency_ms, observed_at, source
    FROM service_latency_observations WHERE service_id = ? ORDER BY observed_at DESC, id DESC LIMIT ?`).all(serviceId, historyLimit) as Record<string, unknown>[];
  const statusHistory = statusRows.map(toStatusEvent);
  const latencyHistory = latencyRows.map(toLatencyObservation);
  return {
    serviceId,
    statusHistory,
    latencyHistory,
    latency: summarizeLatency(latencyHistory, latencyRows.length >= historyLimit),
    availability: summarizeAvailability(statusHistory, windowHours, statusRows.length >= historyLimit),
    dependencies: listServiceDependencies(serviceId),
    containerState: getServiceContainerState(serviceId),
    backup: getServiceBackupMetadata(serviceId),
  };
}

export function listServiceDependencies(serviceIdInput: string): ServiceDependency[] {
  const serviceId = requireId(serviceIdInput, "serviceId");
  const rows = getDatabase().prepare(`SELECT service_id, depends_on_service_id, label, is_critical, created_at, updated_at
    FROM service_dependencies WHERE service_id = ? ORDER BY depends_on_service_id ASC`).all(serviceId) as Record<string, unknown>[];
  return rows.map((row) => ({
    serviceId: String(row.service_id),
    dependsOnServiceId: String(row.depends_on_service_id),
    label: row.label ? String(row.label) : undefined,
    critical: Boolean(row.is_critical),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

function getServiceContainerState(serviceId: string): ServiceContainerState | undefined {
  const row = getDatabase().prepare(`SELECT service_id, state, health_status, container_id, container_name, image,
    restart_count, started_at, finished_at, observed_at, source, updated_at
    FROM service_container_state WHERE service_id = ?`).get(serviceId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    serviceId: String(row.service_id),
    state: row.state as ServiceContainerState["state"],
    healthStatus: row.health_status as ServiceContainerState["healthStatus"],
    containerId: row.container_id ? String(row.container_id) : undefined,
    containerName: row.container_name ? String(row.container_name) : undefined,
    image: row.image ? String(row.image) : undefined,
    restartCount: Number(row.restart_count),
    startedAt: row.started_at ? String(row.started_at) : undefined,
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    observedAt: String(row.observed_at),
    source: String(row.source),
    updatedAt: String(row.updated_at),
  };
}

function getServiceBackupMetadata(serviceId: string): ServiceBackupMetadata | undefined {
  const row = getDatabase().prepare(`SELECT service_id, status, last_backup_at, provider, reference, message, observed_at, updated_at
    FROM service_backup_metadata WHERE service_id = ?`).get(serviceId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    serviceId: String(row.service_id),
    status: row.status as ServiceBackupMetadata["status"],
    lastBackupAt: row.last_backup_at ? String(row.last_backup_at) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    reference: row.reference ? String(row.reference) : undefined,
    message: row.message ? String(row.message) : undefined,
    observedAt: String(row.observed_at),
    updatedAt: String(row.updated_at),
  };
}

function toStatusEvent(row: Record<string, unknown>): ServiceStatusEvent {
  return {
    id: Number(row.id),
    serviceId: String(row.service_id),
    status: row.status as ServiceStatus,
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? undefined : Number(row.latency_ms),
    observedAt: String(row.observed_at),
    source: String(row.source),
  };
}

function toLatencyObservation(row: Record<string, unknown>): ServiceLatencyObservation {
  return {
    id: Number(row.id),
    serviceId: String(row.service_id),
    status: row.status as ServiceStatus,
    latencyMs: Number(row.latency_ms),
    observedAt: String(row.observed_at),
    source: String(row.source),
  };
}

function summarizeLatency(history: ServiceLatencyObservation[], historyTruncated: boolean): LatencySummary {
  if (!history.length) return { observationCount: 0, historyTruncated };
  const values = history.map((observation) => observation.latencyMs).sort((left, right) => left - right);
  const p95Index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * 0.95) - 1));
  return {
    observationCount: history.length,
    averageMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    p95Ms: values[p95Index],
    lastMs: history[0].latencyMs,
    lastObservedAt: history[0].observedAt,
    historyTruncated,
  };
}

function summarizeAvailability(history: ServiceStatusEvent[], windowHours: number, historyTruncated: boolean): AvailabilitySummary {
  const now = Date.now();
  const requestedStart = now - windowHours * 60 * 60 * 1000;
  const ascending = [...history]
    .map((event) => ({ ...event, timestamp: Date.parse(event.observedAt) }))
    .filter((event) => Number.isFinite(event.timestamp) && event.timestamp <= now)
    .sort((left, right) => left.timestamp - right.timestamp || left.id - right.id);
  const first = ascending.find((event) => event.timestamp >= requestedStart) || ascending[0];
  if (!first) {
    return {
      windowStart: new Date(requestedStart).toISOString(),
      windowEnd: new Date(now).toISOString(),
      totalSeconds: 0,
      onlineSeconds: 0,
      degradedSeconds: 0,
      offlineSeconds: 0,
      unknownSeconds: 0,
      uptimePercent: 0,
      availabilityPercent: 0,
      coveragePercent: 0,
      currentStatus: "unknown",
      historyTruncated,
    };
  }
  const startIndex = Math.max(0, ascending.indexOf(first));
  const start = Math.max(requestedStart, first.timestamp);
  const end = ascending[ascending.length - 1].timestamp;
  const seconds = { online: 0, degraded: 0, offline: 0, unknown: 0 };
  for (let index = startIndex; index < ascending.length - 1; index += 1) {
    const event = ascending[index];
    const next = ascending[index + 1];
    const from = Math.max(start, event.timestamp);
    const to = Math.min(end, next.timestamp);
    if (to <= from) continue;
    seconds[event.status] += (to - from) / 1000;
  }
  const totalSeconds = Object.values(seconds).reduce((sum, value) => sum + value, 0);
  const windowSeconds = Math.max(0, now - requestedStart) / 1000;
  const currentStatus = ascending[ascending.length - 1].status;
  return {
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
    totalSeconds: roundSeconds(totalSeconds),
    onlineSeconds: roundSeconds(seconds.online),
    degradedSeconds: roundSeconds(seconds.degraded),
    offlineSeconds: roundSeconds(seconds.offline),
    unknownSeconds: roundSeconds(seconds.unknown),
    uptimePercent: totalSeconds ? roundPercent((seconds.online / totalSeconds) * 100) : 0,
    availabilityPercent: totalSeconds ? roundPercent(((seconds.online + seconds.degraded) / totalSeconds) * 100) : 0,
    coveragePercent: windowSeconds ? roundPercent((totalSeconds / windowSeconds) * 100) : 0,
    currentStatus,
    historyTruncated,
  };
}

function requireId(value: string, name: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 160) throw new Error(`${name} must be a non-empty value up to 160 characters.`);
  return normalized;
}

function requireEnum<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  throw new Error(`${name} is invalid.`);
}

function requireNonNegativeInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > 86_400_000) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function parseTimestamp(value: string | undefined, name: string) {
  if (value === undefined) return new Date().toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${name} must be a valid ISO timestamp.`);
  return new Date(timestamp).toISOString();
}

function normalizeOptionalTimestamp(value: string | undefined) {
  if (value === undefined || value === "") return undefined;
  return parseTimestamp(value, "timestamp");
}

function normalizeOptionalText(value: string | undefined, maxLength: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function normalizeSource(value: string | undefined) {
  return normalizeOptionalText(value, 80) || "health";
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value)) throw new Error("Query limits must be integers.");
  return Math.min(maximum, Math.max(minimum, value));
}

function roundPercent(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function roundSeconds(value: number) {
  return Number(value.toFixed(3));
}
