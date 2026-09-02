import assert from "node:assert/strict";
import test from "node:test";
import { classifyHealthTransportError, fetchHealthStatus, validateHealthResponse } from "./health-client.ts";

const responseOk = { ok: true, status: 200 };

test("normalizes a valid fetch response without accepting a non-OK payload", async () => {
  const response = await fetchHealthStatus("/api/health?id=demo", {
    fetcher: async () => new Response(JSON.stringify({ status: "offline" }), { status: 200 }),
  });
  assert.deepEqual(response, { kind: "valid", response: { status: "offline" } });

  const apiError = await fetchHealthStatus("/api/health?id=demo", {
    fetcher: async () => new Response(JSON.stringify({ status: "online" }), { status: 503 }),
  });
  const malformedApiError = await fetchHealthStatus("/api/health?id=demo", {
    fetcher: async () => new Response("not json", { status: 503 }),
  });
  assert.deepEqual(malformedApiError, { kind: "api-error", message: "Health API returned HTTP 503." });

  const malformed = await fetchHealthStatus("/api/health?id=demo", {
    fetcher: async () => new Response("not json", { status: 200 }),
  });
  assert.deepEqual(malformed, { kind: "malformed", message: "Health API returned an invalid response." });

  const transportError = await fetchHealthStatus("/api/health?id=demo", {
    fetcher: async () => { throw new Error("request timed out"); },
  });
  assert.deepEqual(transportError, { kind: "transport-error", message: "request timed out" });
});

test("accepts every status in the client health response contract", () => {
  for (const status of ["online", "degraded", "offline", "unknown"] as const) {
    assert.deepEqual(validateHealthResponse(responseOk, { status }), { kind: "valid", response: { status } });
  }
});

test("rejects malformed successful health responses", () => {
  for (const payload of [null, [], {}, { status: "pending" }, { status: 1 }, { status: "online", latency: -1 }, { status: "online", latency: "fast" }, { status: "online", statusCode: "200" }, { status: "online", statusCode: null }]) {
    const result = validateHealthResponse(responseOk, payload);
    assert.equal(result.kind, "malformed");
  }
});

test("classifies a non-OK response as an API failure before accepting its body", () => {
  assert.deepEqual(validateHealthResponse({ ok: false, status: 503 }, { status: "online" }), {
    kind: "api-error",
    message: "Health API returned HTTP 503.",
  });
});

test("classifies transport failures separately from API responses", () => {
  assert.deepEqual(classifyHealthTransportError(new Error("request timed out")), {
    kind: "transport-error",
    message: "request timed out",
  });
  assert.deepEqual(classifyHealthTransportError("connection lost"), {
    kind: "transport-error",
    message: "Unable to reach the health API.",
  });
});

test("accepts the optional metadata returned by the health endpoint", () => {
  assert.deepEqual(validateHealthResponse(responseOk, { status: "online", latency: 42, statusCode: 200 }), {
    kind: "valid",
    response: { status: "online", latency: 42, statusCode: 200 },
  });
});
