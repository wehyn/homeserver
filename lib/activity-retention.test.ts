import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ACTIVITY_MAX_ROWS, pruneActivities } from "./activity-retention.ts";

async function withDatabase<T>(callback: (database: DatabaseSync) => Promise<T> | T) {
  const root = mkdtempSync(join(tmpdir(), "nimbus-activity-"));
  const database = new DatabaseSync(join(root, "activity.db"));
  try {
    database.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, app_id TEXT, app_name TEXT NOT NULL, status TEXT, created_at TEXT NOT NULL)");
    database.exec("CREATE TABLE apps (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    database.exec("CREATE TABLE metric_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, recorded_at TEXT NOT NULL, cpu REAL NOT NULL)");
    database.prepare("INSERT INTO apps (id, name) VALUES (?, ?)").run("activity-app", "Activity app");
    database.prepare("INSERT INTO metric_snapshots (recorded_at, cpu) VALUES (?, ?)").run(new Date().toISOString(), 17);
    return await callback(database);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("retains recent activity while pruning old rows and preserving metrics", async () => {
  await withDatabase((database) => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    const insert = database.prepare("INSERT INTO activities (type, app_id, app_name, status, created_at) VALUES (?, ?, ?, ?, ?)");
    insert.run("app-updated", "activity-app", "Activity app", "online", old);
    insert.run("app-updated", "activity-app", "Activity app", "online", recent);
    pruneActivities(database);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities WHERE created_at = ?").get(old)?.count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities WHERE created_at = ?").get(recent)?.count, 1);
    assert.equal(database.prepare("SELECT name FROM apps WHERE id = ?").get("activity-app")?.name, "Activity app");
    assert.equal(database.prepare("SELECT cpu FROM metric_snapshots").get()?.cpu, 17);
  });
});

test("enforces the activity row cap without changing app rows", async () => {
  await withDatabase((database) => {
    const insert = database.prepare("INSERT INTO activities (type, app_id, app_name, status, created_at) VALUES (?, ?, ?, ?, ?)");
    for (let index = 0; index < ACTIVITY_MAX_ROWS + 5; index += 1) {
      insert.run("app-updated", "activity-app", "Activity app", "online", new Date(Date.now() - (ACTIVITY_MAX_ROWS + 5 - index) * 1_000).toISOString());
    }
    pruneActivities(database);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities").get()?.count, ACTIVITY_MAX_ROWS);
    assert.equal(database.prepare("SELECT name FROM apps WHERE id = ?").get("activity-app")?.name, "Activity app");
  });
});