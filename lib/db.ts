import "server-only";

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { toDatabaseRow } from "./db-row";
import { seedApps } from "./seed";
import type { DockerContainer, DockerContainerState, DockerHealthState } from "./docker-discovery";
import type { ActivityEvent, ActivityType, AppStatus, ManagedApp } from "./types";

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "nimbus.db");
let database: DatabaseSync | undefined;

function getDatabase() {
  if (!database) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS apps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'Other',
        url TEXT NOT NULL,
        icon TEXT,
        color TEXT NOT NULL DEFAULT '#65e6a5',
        health_url TEXT,
        allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        source TEXT NOT NULL DEFAULT 'manual',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        docker_project TEXT,
        docker_service TEXT,
        container_id TEXT,
        container_name TEXT,
        container_image TEXT,
        container_state TEXT NOT NULL DEFAULT 'unknown',
        container_health TEXT NOT NULL DEFAULT 'unknown',
        container_started_at TEXT,
        container_observed_at TEXT,
        casaos_scheme TEXT,
        casaos_hostname TEXT,
        casaos_port_map TEXT,
        casaos_index TEXT
      )
    `);
    const appColumns = database.prepare("PRAGMA table_info(apps)").all() as { name?: unknown }[];
    if (!appColumns.some((column) => column.name === "allow_insecure_tls")) {
      database.exec("ALTER TABLE apps ADD COLUMN allow_insecure_tls INTEGER NOT NULL DEFAULT 0");
    }
    addColumnIfMissing(database, appColumns, "docker_project", "TEXT");
    addColumnIfMissing(database, appColumns, "docker_service", "TEXT");
    addColumnIfMissing(database, appColumns, "container_id", "TEXT");
    addColumnIfMissing(database, appColumns, "container_name", "TEXT");
    addColumnIfMissing(database, appColumns, "container_image", "TEXT");
    addColumnIfMissing(database, appColumns, "container_state", "TEXT NOT NULL DEFAULT 'unknown'");
    addColumnIfMissing(database, appColumns, "container_health", "TEXT NOT NULL DEFAULT 'unknown'");
    addColumnIfMissing(database, appColumns, "container_started_at", "TEXT");
    addColumnIfMissing(database, appColumns, "container_observed_at", "TEXT");
    addColumnIfMissing(database, appColumns, "casaos_scheme", "TEXT");
    addColumnIfMissing(database, appColumns, "casaos_hostname", "TEXT");
    addColumnIfMissing(database, appColumns, "casaos_port_map", "TEXT");
    addColumnIfMissing(database, appColumns, "casaos_index", "TEXT");
    database.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        app_id TEXT,
        app_name TEXT NOT NULL,
        status TEXT,
        created_at TEXT NOT NULL
      )
    `);
    database.exec("CREATE INDEX IF NOT EXISTS activities_created_at_idx ON activities (created_at DESC)");
    const count = database.prepare("SELECT COUNT(*) as count FROM apps").get() as { count: number };
    if (count.count === 0) {
      const insert = database.prepare(`INSERT INTO apps (id, name, description, category, url, icon, color, health_url, allow_insecure_tls, status, source, is_favorite, is_visible, sort_order, docker_project, docker_service, container_id, container_name, container_image, container_state, container_health, container_started_at, container_observed_at, casaos_scheme, casaos_hostname, casaos_port_map, casaos_index)
        VALUES (@id, @name, @description, @category, @url, @icon, @color, @healthUrl, @allowInsecureTls, @status, @source, @isFavorite, @isVisible, @sortOrder, @dockerProject, @dockerService, @containerId, @containerName, @containerImage, @containerState, @containerHealth, @containerStartedAt, @containerObservedAt, @casaosScheme, @casaosHostname, @casaosPortMap, @casaosIndex)`);
      database.exec("BEGIN");
      try {
        seedApps.forEach((app) => insert.run(toDatabaseRow(app)));
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  }
  return database;
}

function fromRow(row: Record<string, unknown>): ManagedApp {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), category: String(row.category),
    url: String(row.url), icon: row.icon ? String(row.icon) : undefined, color: String(row.color),
    healthUrl: row.health_url ? String(row.health_url) : undefined, allowInsecureTls: Boolean(row.allow_insecure_tls), status: row.status as ManagedApp["status"],
    source: row.source as ManagedApp["source"], isFavorite: Boolean(row.is_favorite), isVisible: Boolean(row.is_visible), sortOrder: Number(row.sort_order),
    dockerProject: row.docker_project ? String(row.docker_project) : undefined,
    dockerService: row.docker_service ? String(row.docker_service) : undefined,
    containerId: row.container_id ? String(row.container_id) : undefined,
    containerName: row.container_name ? String(row.container_name) : undefined,
    containerImage: row.container_image ? String(row.container_image) : undefined,
    containerState: row.container_observed_at || row.container_state !== "unknown" ? normalizeContainerState(row.container_state) : undefined,
    containerHealth: row.container_observed_at || row.container_health !== "unknown" ? normalizeContainerHealth(row.container_health) : undefined,
    containerStartedAt: row.container_started_at ? String(row.container_started_at) : undefined,
    containerObservedAt: row.container_observed_at ? String(row.container_observed_at) : undefined,
    casaosScheme: row.casaos_scheme === "http" || row.casaos_scheme === "https" ? row.casaos_scheme : undefined,
    casaosHostname: row.casaos_hostname ? String(row.casaos_hostname) : undefined,
    casaosPortMap: row.casaos_port_map ? String(row.casaos_port_map) : undefined,
    casaosIndex: row.casaos_index ? String(row.casaos_index) : undefined,
  };
}

export function listApps() {
  return (getDatabase().prepare("SELECT * FROM apps ORDER BY sort_order ASC, name ASC").all() as Record<string, unknown>[]).map(fromRow);
}

export function findApp(id: string) {
  const row = getDatabase().prepare("SELECT * FROM apps WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? fromRow(row) : undefined;
}

export function saveApp(app: ManagedApp) {
  const database = getDatabase();
  const existing = database.prepare("SELECT id, status, docker_project, docker_service FROM apps WHERE id = ?").get(app.id) as {
    id?: string;
    status?: AppStatus;
    docker_project?: string | null;
    docker_service?: string | null;
  } | undefined;
  let persistedApp = existing ? { ...app, status: existing.status || app.status } : app;
  if (existing && (normalizeLinkValue(existing.docker_project) !== normalizeLinkValue(app.dockerProject)
    || normalizeLinkValue(existing.docker_service) !== normalizeLinkValue(app.dockerService))) {
    persistedApp = clearDockerMetadata(persistedApp);
  }
  database.prepare(`INSERT INTO apps (id, name, description, category, url, icon, color, health_url, allow_insecure_tls, status, source, is_favorite, is_visible, sort_order, docker_project, docker_service, container_id, container_name, container_image, container_state, container_health, container_started_at, container_observed_at, casaos_scheme, casaos_hostname, casaos_port_map, casaos_index)
    VALUES (@id, @name, @description, @category, @url, @icon, @color, @healthUrl, @allowInsecureTls, @status, @source, @isFavorite, @isVisible, @sortOrder, @dockerProject, @dockerService, @containerId, @containerName, @containerImage, @containerState, @containerHealth, @containerStartedAt, @containerObservedAt, @casaosScheme, @casaosHostname, @casaosPortMap, @casaosIndex)
    ON CONFLICT(id) DO UPDATE SET name=@name, description=@description, category=@category, url=@url, icon=@icon, color=@color, health_url=@healthUrl, allow_insecure_tls=@allowInsecureTls, status=@status, source=@source, is_favorite=@isFavorite, is_visible=@isVisible, sort_order=@sortOrder, docker_project=@dockerProject, docker_service=@dockerService, container_id=@containerId, container_name=@containerName, container_image=@containerImage, container_state=@containerState, container_health=@containerHealth, container_started_at=@containerStartedAt, container_observed_at=@containerObservedAt, casaos_scheme=@casaosScheme, casaos_hostname=@casaosHostname, casaos_port_map=@casaosPortMap, casaos_index=@casaosIndex`).run(toDatabaseRow(persistedApp));
  recordActivity(existing ? "app-updated" : "app-created", persistedApp.id, persistedApp.name);
  return persistedApp;
}

export function reconcileDockerApps(containers: DockerContainer[], options: { preserveUnmatched?: boolean } = {}) {
  const database = getDatabase();
  const apps = listApps();
  const claimed = new Set<string>();
  const now = new Date().toISOString();
  for (const app of apps) {
    const container = findContainerForApp(app, containers, claimed);
    if (container) {
      claimed.add(container.id);
      const casaos = container.casaos;
      database.prepare(`UPDATE apps SET docker_project = ?, docker_service = ?, container_id = ?, container_name = ?, container_image = ?, container_state = ?, container_health = ?, container_started_at = ?, container_observed_at = ?, casaos_scheme = ?, casaos_hostname = ?, casaos_port_map = ?, casaos_index = ? WHERE id = ?`).run(
        container.compose.project || app.dockerProject || null,
        container.compose.service || app.dockerService || null,
        container.id,
        container.name,
        container.image,
        container.state,
        container.health,
        container.startedAt,
        now,
        casaos?.scheme || app.casaosScheme || null,
        casaos?.hostname || app.casaosHostname || null,
        casaos?.portMap || app.casaosPortMap || null,
        casaos?.index || app.casaosIndex || null,
        app.id,
      );
    } else if (!options.preserveUnmatched && (app.containerId || app.dockerProject || app.dockerService)) {
      database.prepare(`UPDATE apps SET container_id = NULL, container_name = NULL, container_image = NULL, container_state = 'unknown', container_health = 'unknown', container_started_at = NULL, container_observed_at = ?, casaos_scheme = NULL, casaos_hostname = NULL, casaos_port_map = NULL, casaos_index = NULL WHERE id = ?`).run(now, app.id);
    }
  }
  return listApps();
}

export function removeApp(id: string) {
  const database = getDatabase();
  const app = database.prepare("SELECT name FROM apps WHERE id = ?").get(id) as { name?: string } | undefined;
  database.prepare("DELETE FROM apps WHERE id = ?").run(id);
  if (app?.name) recordActivity("app-deleted", id, app.name);
}

export function updateAppStatus(id: string, status: AppStatus) {
  const database = getDatabase();
  const app = database.prepare("SELECT name, status FROM apps WHERE id = ?").get(id) as { name?: string; status?: AppStatus } | undefined;
  if (!app?.name || app.status === status) return;
  const result = database.prepare("UPDATE apps SET status = ? WHERE id = ? AND status IS NOT ?").run(status, id, status);
  if (Number(result.changes) !== 1) return;
  recordActivity("status-changed", id, app.name, status);
}

export function listActivities(limit = 5): ActivityEvent[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 5;
  const rows = getDatabase().prepare(`SELECT id, type, app_id, app_name, status, created_at
    FROM activities ORDER BY created_at DESC, id DESC LIMIT ?`).all(normalizedLimit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    type: row.type as ActivityType,
    appId: row.app_id ? String(row.app_id) : undefined,
    appName: String(row.app_name),
    status: row.status ? row.status as AppStatus : undefined,
    createdAt: String(row.created_at),
  }));
}

function recordActivity(type: ActivityType, appId: string, appName: string, status?: AppStatus) {
  getDatabase().prepare(`INSERT INTO activities (type, app_id, app_name, status, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(type, appId, appName, status ?? null, new Date().toISOString());
}

function addColumnIfMissing(database: DatabaseSync, columns: { name?: unknown }[], name: string, definition: string) {
  if (!columns.some((column) => column.name === name)) database.exec(`ALTER TABLE apps ADD COLUMN ${name} ${definition}`);
}

function clearDockerMetadata(app: ManagedApp): ManagedApp {
  return {
    ...app,
    containerId: undefined,
    containerName: undefined,
    containerImage: undefined,
    containerState: undefined,
    containerHealth: undefined,
    containerStartedAt: undefined,
    containerObservedAt: undefined,
    casaosScheme: undefined,
    casaosHostname: undefined,
    casaosPortMap: undefined,
    casaosIndex: undefined,
  };
}

function normalizeLinkValue(value: string | null | undefined) {
  return value?.trim() || "";
}

function findContainerForApp(app: ManagedApp, containers: DockerContainer[], claimed: Set<string>) {
  const candidates = containers.filter((container) => !claimed.has(container.id));
  if (app.containerId) {
    const byId = candidates.find((container) => container.id === app.containerId);
    if (byId) return byId;
  }
  if (app.dockerProject && app.dockerService) {
    return candidates.find((container) => container.compose.project === app.dockerProject && container.compose.service === app.dockerService);
  }
  const byLabel = candidates.find((container) => container.labels["com.nimbus.app-id"] === app.id);
  if (byLabel) return byLabel;
  if (app.dockerService) {
    const serviceMatches = candidates.filter((container) => container.compose.service === app.dockerService);
    if (serviceMatches.length === 1) return serviceMatches[0];
    if (serviceMatches.length > 1) return undefined;
  }
  const normalizedIds = new Set([normalizeIdentifier(app.id), normalizeIdentifier(app.name)].filter(Boolean));
  if (app.dockerProject) {
    const projectMatches = candidates.filter((container) => container.compose.project === app.dockerProject);
    if (projectMatches.length === 1) return projectMatches[0];
    const exactProjectMatch = projectMatches.filter((container) => {
      const values = [container.name, container.compose.service].map((value) => normalizeIdentifier(value || ""));
      return values.some((value) => value && normalizedIds.has(value));
    });
    if (exactProjectMatch.length === 1) return exactProjectMatch[0];
    if (projectMatches.length > 1) return undefined;
    if (projectMatches.length === 0) return undefined;
  }
  const exact = candidates.filter((container) => {
    const values = [container.name, container.compose.project, container.compose.service].map((value) => normalizeIdentifier(value || ""));
    return values.some((value) => value && normalizedIds.has(value));
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return chooseProjectContainer(exact, normalizedIds);
  const loose = candidates.filter((container) => {
    const values = [container.name, container.compose.project, container.compose.service].map((value) => normalizeIdentifier(value || ""));
    return values.some((value) => value && [...normalizedIds].some((id) => value.startsWith(id) || id.startsWith(value)));
  });
  if (loose.length === 1) return loose[0];
  return undefined;
}

function chooseProjectContainer(containers: DockerContainer[], normalizedIds: Set<string>) {
  return [...containers].sort((left, right) => containerMatchScore(right, normalizedIds) - containerMatchScore(left, normalizedIds))[0];
}

function containerMatchScore(container: DockerContainer, normalizedIds: Set<string>) {
  const service = normalizeIdentifier(container.compose.service || "");
  const name = normalizeIdentifier(container.name);
  return (container.casaos ? 100 : 0)
    + (container.state === "running" ? 20 : 0)
    + (normalizedIds.has(service) ? 50 : 0)
    + (normalizedIds.has(name) ? 40 : 0)
    + (service.includes("server") || service.includes("web") || service.includes("app") ? 10 : 0);
}

function normalizeIdentifier(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeContainerState(value: unknown): DockerContainerState {
  return ["created", "restarting", "running", "removing", "paused", "exited", "dead", "unknown"].includes(String(value))
    ? value as DockerContainerState
    : "unknown";
}

function normalizeContainerHealth(value: unknown): DockerHealthState {
  return ["healthy", "unhealthy", "starting", "none", "unknown"].includes(String(value))
    ? value as DockerHealthState
    : "unknown";
}
