import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectDockerSnapshot,
  normalizeDockerContainer,
  parseCasaOSMetadata,
  parseComposeProject,
  parseComposeServiceDetails,
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
  assert.deepEqual(parseComposeServiceDetails(compose, "web"), {
    image: "example:latest",
    networks: [],
    ports: [],
    volumes: [],
    environment: [],
  });
});

test("parses Docker details from a Compose service", () => {
  const compose = `services:
  app:
    image: example/app:2.4
    ports:
      - "127.0.0.1:8080:80"
      - "8443:443/udp"
    networks:
      - proxy
      - default
    volumes:
      - ./config:/etc/example:ro
      - example-data:/var/lib/example
    environment:
      APP_MODE: production
      - APP_NAME=Example
      - EMPTY_VALUE
`;
  assert.deepEqual(parseComposeServiceDetails(compose, "app"), {
    image: "example/app:2.4",
    networks: ["default", "proxy"],
    ports: [
      { containerPort: 80, protocol: "tcp", hostIp: "127.0.0.1", hostPort: 8080 },
      { containerPort: 443, protocol: "udp", hostIp: null, hostPort: 8443 },
    ],
    volumes: [
      { type: "bind", source: "./config", target: "/etc/example", mode: "ro" },
      { type: "volume", source: "example-data", target: "/var/lib/example", mode: null },
    ],
    environment: [
      { name: "APP_MODE", value: "production" },
      { name: "APP_NAME", value: "Example" },
      { name: "EMPTY_VALUE", value: "" },
    ],
  });
});

test("parses long-form Compose ports and volumes", () => {
  const compose = `services:
  app:
    ports:
      - target: 2283
        published: 2283
        protocol: tcp
        host_ip: "::"
      - target: 8080
    volumes:
      - type: bind
        source: ./config
        target: /etc/example
        read_only: true
      - type: volume
        source: example-cache
        target: /var/cache/example
`;
  assert.deepEqual(parseComposeServiceDetails(compose, "app"), {
    image: null,
    networks: [],
    ports: [
      { containerPort: 2283, protocol: "tcp", hostIp: "0.0.0.0", hostPort: 2283 },
      { containerPort: 8080, protocol: "tcp", hostIp: null, hostPort: null },
    ],
    volumes: [
      { type: "bind", source: "./config", target: "/etc/example", mode: "ro" },
      { type: "volume", source: "example-cache", target: "/var/cache/example", mode: null },
    ],
    environment: [],
  });
});

test("parses bracketed IPv6 Compose port bindings", () => {
  const compose = `services:
  app:
    ports:
      - "[::1]:8443:443/tcp"
`;
  assert.deepEqual(parseComposeServiceDetails(compose, "app").ports, [
    { containerPort: 443, protocol: "tcp", hostIp: "::1", hostPort: 8443 },
]);
});

test("expands Compose port ranges into inspect-compatible entries", () => {
  const compose = `services:
  app:
    ports:
      - "8000-8002:80-82"
      - "9000-9001"
`;
  assert.deepEqual(parseComposeServiceDetails(compose, "app").ports, [
    { containerPort: 80, protocol: "tcp", hostIp: null, hostPort: 8000 },
    { containerPort: 81, protocol: "tcp", hostIp: null, hostPort: 8001 },
    { containerPort: 82, protocol: "tcp", hostIp: null, hostPort: 8002 },
    { containerPort: 9000, protocol: "tcp", hostIp: null, hostPort: null },
    { containerPort: 9001, protocol: "tcp", hostIp: null, hostPort: null },
  ]);
});

test("handles inline Compose collections, anonymous volumes, and nested names", () => {
  const compose = `name: actual-project
services:
  app:
    labels:
      name: nested-value
    ports: ["80:80", "127.0.0.1:8080:80"]
    networks: [proxy, default]
    volumes:
      - /var/lib/app
      - /config:ro
`;
  assert.equal(parseComposeProject(compose), "actual-project");
  assert.deepEqual(parseComposeServiceDetails(compose, "app"), {
    image: null,
    networks: ["default", "proxy"],
    ports: [
      { containerPort: 80, protocol: "tcp", hostIp: null, hostPort: 80 },
      { containerPort: 80, protocol: "tcp", hostIp: "127.0.0.1", hostPort: 8080 },
    ],
    volumes: [
      { type: "volume", source: null, target: "/config", mode: "ro" },
      { type: "volume", source: null, target: "/var/lib/app", mode: null },
    ],
    environment: [],
  });
});

test("prefers the inspected image over an interpolated Compose image", () => {
  const container = normalizeDockerContainer(
    { Id: "container-id", Image: "demo:release", State: "running", Ports: [] },
    { Id: "container-id", Config: { Image: "demo:release" } },
    [{
      project: "demo",
      service: "web",
      casaos: null,
      details: { image: "demo:${TAG:-latest}", networks: [], ports: [], volumes: [], environment: [] },
    }],
  );
  assert.equal(container?.image, "demo:release");
});

test("does not attach the first Compose service when a container lacks a service label", () => {
  const container = normalizeDockerContainer(
    { Id: "container-id", Names: ["/demo"], Image: "demo:latest", State: "running", Ports: [] },
    { Id: "container-id", Config: { Labels: { "com.docker.compose.project": "demo" } } },
    [{
      project: "demo",
      service: "web",
      casaos: { scheme: "http", hostname: "web.local", portMap: "8080", index: "/" },
      details: { image: "demo:web", networks: ["demo_default"], ports: [], volumes: [], environment: [] },
    }],
  );
  assert.equal(container?.casaos, null);
  assert.equal(container?.image, "demo:latest");
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
      details: { image: "demo:latest", networks: ["demo_default"], ports: [], volumes: [], environment: [] },
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns Compose metadata when live Docker discovery is disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-services-"));
  try {
    await writeFile(join(root, "docker-compose.yml"), `services:
  app:
    image: demo:latest
    ports:
      - "8080:80"
    volumes:
      - ./data:/data
`);
    const snapshot = await collectDockerSnapshot({ socketPath: "", servicesRoot: root });
    const project = root.split("/").pop() || "unknown";
    assert.equal(snapshot.available, false);
    assert.equal(snapshot.status, "unavailable");
    assert.deepEqual(snapshot.composeServices?.map((service) => ({
      project: service.project,
      service: service.service,
      networks: service.details.networks,
      ports: service.details.ports,
      volumes: service.details.volumes,
    })), [{
      project,
      service: "app",
      networks: [`${project}_default`],
      ports: [{ containerPort: 80, protocol: "tcp", hostIp: null, hostPort: 8080 }],
      volumes: [{ type: "bind", source: "./data", target: "/data", mode: null }],
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
        Config: {
          Image: "demo:latest",
          Env: ["APP_MODE=production", "APP_SECRET=secret-value"],
          Labels: { "com.docker.compose.project": "demo", "com.docker.compose.service": "web" },
        },
        State: { Status: "running", StartedAt: "2026-08-03T00:00:00.000Z", Health: { Status: "healthy" } },
        NetworkSettings: { Networks: { proxy: {}, default: {} }, Ports: { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "18080" }] } },
        Mounts: [{ Type: "bind", Source: "/srv/demo", Destination: "/data", RW: false }],
      };
    },
  });
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.containers[0]?.state, "running");
  assert.equal(snapshot.containers[0]?.health, "healthy");
  assert.deepEqual(snapshot.containers[0]?.networks, ["default", "proxy"]);
  assert.deepEqual(snapshot.containers[0]?.ports, [{ containerPort: 8080, protocol: "tcp", hostIp: "127.0.0.1", hostPort: 18080 }]);
  assert.deepEqual(snapshot.containers[0]?.volumes, [{ type: "bind", source: "/srv/demo", target: "/data", mode: "ro" }]);
  assert.deepEqual(snapshot.containers[0]?.environment, [{ name: "APP_MODE", value: "production" }, { name: "APP_SECRET", value: "<redacted>" }]);
  assert.deepEqual(calls, ["/containers/json?all=true", "/containers/container-id/json"]);
});

test("keeps live Docker discovery authoritative when Compose metadata is unavailable", async () => {
  const missingRoot = join(tmpdir(), "nimbus-services-does-not-exist");
  const snapshot = await collectDockerSnapshot({
    socketPath: "/var/run/docker.sock",
    servicesRoot: missingRoot,
    requestJson: async (path) => path === "/containers/json?all=true"
      ? [{ Id: "container-id", Names: ["/demo"], Image: "demo:latest", State: "running", Ports: [] }]
      : { Id: "container-id", Name: "/demo", Config: {}, State: { Status: "running" } },
  });
  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.warnings.some((warning) => warning.includes("Compose metadata is unavailable")), true);
});

test("collapses IPv4 and IPv6 wildcard bindings for one published port", async () => {
  const snapshot = await collectDockerSnapshot({
    socketPath: "/var/run/docker.sock",
    servicesRoot: "",
    requestJson: async (path) => path === "/containers/json?all=true"
      ? [{ Id: "container-id", Names: ["/demo"], Image: "demo:latest", State: "running", Ports: [
        { PrivatePort: 2283, Type: "tcp", IP: "0.0.0.0", PublicPort: 2283 },
        { PrivatePort: 2283, Type: "tcp", IP: "::", PublicPort: 2283 },
      ] }]
      : {
        Id: "container-id",
        Config: { Image: "demo:latest" },
        State: { Status: "running" },
        NetworkSettings: { Ports: { "2283/tcp": [
          { HostIp: "0.0.0.0", HostPort: "2283" },
          { HostIp: "::", HostPort: "2283" },
        ] } },
      },
  });
  assert.deepEqual(snapshot.containers[0]?.ports, [{ containerPort: 2283, protocol: "tcp", hostIp: "0.0.0.0", hostPort: 2283 }]);
});

test("reports Docker discovery as unavailable when the socket is disabled", async () => {
  const snapshot = await collectDockerSnapshot({ socketPath: "", servicesRoot: "/host/services" });
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.status, "unavailable");
  assert.match(snapshot.warnings[0], /socket is disabled/);
});
