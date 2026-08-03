import assert from "node:assert/strict";
import test from "node:test";
import { buildCasaOSHealthTarget, isCasaOSHealthSuccess, parseCasaOSPort, resolveHealthTarget } from "./health-target.ts";

test("builds a CasaOS WebUI URL from x-casaos fields", () => {
  assert.equal(parseCasaOSPort("8080"), 8080);
  assert.equal(buildCasaOSHealthTarget({ casaosScheme: "http", casaosHostname: "localhost", casaosPortMap: "8080", casaosIndex: "/login" }), "http://localhost:8080/login");
});

test("uses the configured health URL when CasaOS metadata is incomplete", () => {
  assert.equal(resolveHealthTarget({ url: "http://app.local", healthUrl: "http://app.local/health", casaosScheme: "http", casaosHostname: "localhost" }), "http://app.local/health");
  assert.equal(parseCasaOSPort("not-a-port"), undefined);
  assert.equal(isCasaOSHealthSuccess(200), true);
  assert.equal(isCasaOSHealthSuccess(401), true);
  assert.equal(isCasaOSHealthSuccess(204), false);
});
