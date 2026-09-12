import type { DatabaseSync } from "node:sqlite";

export const ACTIVITY_RETENTION_DAYS = 90;
export const ACTIVITY_MAX_ROWS = 1000;

export function pruneActivities(database: DatabaseSync, now = Date.now) {
  const cutoff = new Date(now() - ACTIVITY_RETENTION_DAYS * 86_400_000).toISOString();
  database.prepare("DELETE FROM activities WHERE created_at < ? OR id NOT IN (SELECT id FROM activities ORDER BY created_at DESC, id DESC LIMIT ?)").run(cutoff, ACTIVITY_MAX_ROWS);
}