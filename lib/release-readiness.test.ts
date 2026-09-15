import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("declares the open-source license without enabling package publication", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    license?: unknown;
    private?: unknown;
  };
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.private, true);
  assert.match(readFileSync(join(root, "LICENSE"), "utf8"), /^MIT License/m);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /distributed under the MIT License/i);
  assert.doesNotMatch(readme, /license has not yet been selected/i);
});
