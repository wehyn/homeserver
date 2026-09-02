import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyMetricsHistoryRequest } from "./metrics-history-request.ts";

test("only the current non-aborted history request may update state", () => {
  const controller = new AbortController();

  assert.equal(shouldApplyMetricsHistoryRequest(2, 2, controller.signal), true);
  assert.equal(shouldApplyMetricsHistoryRequest(1, 2, controller.signal), false);

  controller.abort();
  assert.equal(shouldApplyMetricsHistoryRequest(2, 2, controller.signal), false);
});