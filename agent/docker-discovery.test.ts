import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectDockerSnapshot,
  parseCasaOSMetadata,
  parseComposeServices,
  readComposeMetadata,
} from "./docker-discovery.ts";

test("parses CasaOS WebUI metadata and Compose services", () => {
  const compose = `name: example\nx-casaos:\n  scheme: http\n  hostname: localhost\n  port_map: "8080"\n  index: /login\nservices:\n  web:\n    image: example:latest\n  database:\n    image: postgres:latest\n`;
  assert.deepEqual(parseCasaOSMetadata(compose), {
    scheme: "http",
    hostname: "localhost",
    portMap: "8080",
    index: "/login",
  });
  assert.deepEqual(parseComposeServices(compose), ["web", "database"]);
  assert.deepEqual(parseComposeServices("services:\n    crafty:\n      image: crafty:latest\n"), ["crafty"]);
  assert.deepEqual(parseComposeServices("services:\n web:\n  image: demo:latest\n"), ["web"]);
});

test("indexes CasaOS metadata beneath the configured services root", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-services-"));
  try {
    const appRoot = join(root, "demo");
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, "docker-compose.yml"), `x-casaos:\n  scheme: https\n  hostname: demo.local\n  port_map: "8443"\n  index: /\nservices:\n  demo:\n    image: demo:latest\n`);
    const result = await readComposeMetadata(root);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.entries, [{
      project: "demo",
      service: "demo",
      casaos: { scheme: "https", hostname: "demo.local", portMap: "8443", index: "/" },
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collects Docker state through read-only GET-shaped requests", async () => {
  const calls: string[] = [];
  const snapshot = await collectDockerSnapshot({
    socketPath: "/var/run/docker.sock",
    servicesRoot: "",
    requestJson: async (path) => {
      calls.push(path);
      if (path === "/containers/json?all=true") {
        return [{ Id: "container-id", Names: ["/demo"], Image: "demo:latest", State: "running", Status: "Up 1 minute", Ports: [] }];
      }
      return {
        Id: "container-id",
        Name: "/demo",
        Config: { Image: "demo:latest", Labels: { "com.docker.compose.project": "demo", "com.docker.compose.service": "web" } },
        State: { Status: "running", StartedAt: "2026-08-03T00:00:00.000Z", Health: { Status: "healthy" } },
      };
    },
  });
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.containers[0]?.state, "running");
  assert.equal(snapshot.containers[0]?.health, "healthy");
  assert.deepEqual(calls, ["/containers/json?all=true", "/containers/container-id/json"]);
});

test("reports Docker discovery as unavailable when the socket is disabled", async () => {
  const snapshot = await collectDockerSnapshot({ socketPath: "", servicesRoot: "/host/services" });
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.status, "unavailable");
  assert.match(snapshot.warnings[0], /socket is disabled/);
});
