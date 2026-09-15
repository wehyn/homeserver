import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("declares the dependency audit policy in package metadata, docs, and CI", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  assert.equal(packageJson.scripts?.audit, "npm audit --audit-level=high");

  const policy = readFileSync(join(root, "docs/dependency-policy.md"), "utf8");
  assert.match(policy, /npm audit --audit-level=high/);
  assert.match(policy, /high and critical advisories/i);

  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /name: Dependency audit/);
  assert.match(workflow, /run: npm run audit/);
});
