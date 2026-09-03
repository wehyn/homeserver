import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI runs deterministic browser regression coverage", () => {
  assert.match(workflow, /browser-regression/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npx playwright test/);
});
