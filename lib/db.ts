import "server-only";

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedApps } from "./seed";
import type { ManagedApp } from "./types";

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
        status TEXT NOT NULL DEFAULT 'unknown',
        source TEXT NOT NULL DEFAULT 'manual',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
    const count = database.prepare("SELECT COUNT(*) as count FROM apps").get() as { count: number };
    if (count.count === 0) {
      const insert = database.prepare(`INSERT INTO apps (id, name, description, category, url, icon, color, health_url, status, source, is_favorite, is_visible, sort_order)
        VALUES (@id, @name, @description, @category, @url, @icon, @color, @healthUrl, @status, @source, @isFavorite, @isVisible, @sortOrder)`);
      database.exec("BEGIN");
      try {
        seedApps.forEach((app) => insert.run(toRow(app)));
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  }
  return database;
}

function toRow(app: ManagedApp) {
  return { ...app, healthUrl: app.healthUrl ?? null, isFavorite: app.isFavorite ? 1 : 0, isVisible: app.isVisible ? 1 : 0 };
}

function fromRow(row: Record<string, unknown>): ManagedApp {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), category: String(row.category),
    url: String(row.url), icon: row.icon ? String(row.icon) : undefined, color: String(row.color),
    healthUrl: row.health_url ? String(row.health_url) : undefined, status: row.status as ManagedApp["status"],
    source: row.source as ManagedApp["source"], isFavorite: Boolean(row.is_favorite), isVisible: Boolean(row.is_visible), sortOrder: Number(row.sort_order),
  };
}

export function listApps() {
  return (getDatabase().prepare("SELECT * FROM apps ORDER BY sort_order ASC, name ASC").all() as Record<string, unknown>[]).map(fromRow);
}

export function saveApp(app: ManagedApp) {
  getDatabase().prepare(`INSERT INTO apps (id, name, description, category, url, icon, color, health_url, status, source, is_favorite, is_visible, sort_order)
    VALUES (@id, @name, @description, @category, @url, @icon, @color, @healthUrl, @status, @source, @isFavorite, @isVisible, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET name=@name, description=@description, category=@category, url=@url, icon=@icon, color=@color, health_url=@healthUrl, status=@status, source=@source, is_favorite=@isFavorite, is_visible=@isVisible, sort_order=@sortOrder`).run(toRow(app));
  return app;
}

export function removeApp(id: string) {
  getDatabase().prepare("DELETE FROM apps WHERE id = ?").run(id);
}
