import assert from "node:assert/strict";
import test from "node:test";
import { toDatabaseRow } from "./db-row.ts";

test("maps a missing application icon to a SQLite null value", () => {
  const row = toDatabaseRow({
    id: "iconless-app",
    name: "Iconless app",
    description: "An app without a custom icon",
    category: "Productivity",
    url: "http://app.local",
    color: "#65e6a5",
    status: "unknown",
    source: "manual",
    isFavorite: false,
    isVisible: true,
    sortOrder: 0,
  });

  assert.equal(row.icon, null);
});
