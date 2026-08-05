import assert from "node:assert/strict";
import test from "node:test";
import { resolveDockerDetails } from "./docker-details.ts";
import type { DockerComposeService, DockerContainer } from "@/agent/docker-discovery-types";
import type { ManagedApp } from "./types.ts";

const app: ManagedApp = {
  id: "immich",
  name: "Immich",
  description: "Photos",
  category: "Media",
  url: "http://server:2283",
  color: "#65e6a5",
  status: "unknown",
  source: "manual",
  isFavorite: false,
  isVisible: true,
  sortOrder: 0,
};

const composeService: DockerComposeService = {
  project: "immich",
  service: "immich-server",
  casaos: null,
  details: {
    image: "ghcr.io/immich-app/immich-server:v3",
    networks: ["immich_default"],
    ports: [{ containerPort: 2283, protocol: "tcp", hostIp: null, hostPort: 2283 }],
    volumes: [{ type: "bind", source: "./library", target: "/data", mode: null }],
    environment: [],
  },
};

test("matches Compose-only metadata by application URL when no Docker socket is available", () => {
  assert.deepEqual(resolveDockerDetails(app, [], [composeService]), {
    source: "compose",
    image: "ghcr.io/immich-app/immich-server:v3",
    networks: ["immich_default"],
    ports: composeService.details.ports,
    volumes: composeService.details.volumes,
    environment: [],
  });
});

test("prefers live container fields and uses Compose fields for gaps", () => {
  const container: DockerContainer = {
    id: "container-id",
    name: "immich_server",
    image: "ghcr.io/immich-app/immich-server:v3",
    compose: { project: "immich", service: "immich-server" },
    labels: {},
    state: "running",
    statusText: "Up",
    health: "healthy",
    casaos: null,
    ports: [],
    networks: ["immich_default"],
    volumes: [],
    environment: [],
    createdAt: null,
    startedAt: null,
  };
  const result = resolveDockerDetails({ ...app, dockerProject: "immich", dockerService: "immich-server" }, [container], [composeService]);
  assert.equal(result?.source, "container");
  assert.deepEqual(result?.ports, composeService.details.ports);
  assert.deepEqual(result?.volumes, composeService.details.volumes);
});

test("honors an explicit project and service even when the app name differs", () => {
  const result = resolveDockerDetails({ ...app, name: "Photo service", dockerProject: "immich", dockerService: "immich-server" }, [], [composeService]);
  assert.equal(result?.source, "compose");
  assert.equal(result?.image, composeService.details.image);
});

test("uses the protocol default port when matching an application URL", () => {
  const result = resolveDockerDetails({ ...app, id: "photos", name: "Photos", url: "http://server" }, [], [{
    ...composeService,
    details: { ...composeService.details, ports: [{ containerPort: 80, protocol: "tcp", hostIp: null, hostPort: 80 }] },
  }]);
  assert.equal(result?.source, "compose");
});
