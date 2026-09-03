import assert from "node:assert/strict";
import test from "node:test";
import { hasAccessibleTextAlternative } from "./accessibility-contract.ts";

test("requires a non-empty text alternative for visual content", () => {
  assert.equal(hasAccessibleTextAlternative("CPU", "CPU readings"), true);
  assert.equal(hasAccessibleTextAlternative("CPU", ""), false);
  assert.equal(hasAccessibleTextAlternative("", "CPU readings"), false);
});
