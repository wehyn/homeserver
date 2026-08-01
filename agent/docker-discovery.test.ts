import assert from "node:assert/strict";
import test from "node:test";
import {
  collectDockerSnapshot,
  normalizeDockerContainer,
  normalizeDockerStats,
} from "./docker-discovery.ts";

test("normalizes Docker metadata, Compose labels, ports, health, and resources", () => {
  const container = normalizeDockerContainer(
    {
      Id: "container-id",
      Names: ["/nimbus"],
      Image: "nimbus:latest",
      Labels: {
        "com.docker.compose.project": "homeserver",
        "com.docker.compose.service": "nimbus",
        purpose: "dashboard",
      },
      State: "running",
      Status: "Up 2 minutes",
      Ports: [{ IP: "0.0.0.0", PrivatePort: 3000, PublicPort: 3000, Type: "tcp" }],
      Created: 1_700_000_000,
    },
    {
      Id: "container-id",
      Name: "/nimbus",
      Config: { Image: "nimbus:latest", Labels: { purpose: "dashboard" } },
      State: {
        Status: "running",
        StartedAt: "2026-08-01T00:00:00.000Z",
        Health: { Status: "healthy" },
      },
      NetworkSettings: {
        Ports: { "3000/tcp": [{ HostIp: "0.0.0.0", HostPort: "3000" }] },
      },
    },
    {
      cpu_stats: {
        cpu_usage: { total_usage: 150, percpu_usage: [100, 50] },
        system_cpu_usage: 1_100,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100, percpu_usage: [75, 25] },
        system_cpu_usage: 1_000,
      },
      memory_stats: { usage: 256, limit: 1_024 },
      networks: { eth0: { rx_bytes: 10, tx_bytes: 20 }, eth1: { rx_bytes: 5, tx_bytes: 7 } },
      pids_stats: { current: 4 },
    },
  );

  assert.deepEqual(container, {
    id: "container-id",
    name: "nimbus",
    image: "nimbus:latest",
    compose: { project: "homeserver", service: "nimbus" },
    labels: {
      "com.docker.compose.project": "homeserver",
      "com.docker.compose.service": "nimbus",
    },
    state: "running",
    statusText: "Up 2 minutes",
    health: "healthy",
    ports: [{ containerPort: 3000, protocol: "tcp", hostIp: "0.0.0.0", hostPort: 3000 }],
    resources: {
      cpuPercent: 100,
      memoryUsageBytes: 256,
      memoryLimitBytes: 1_024,
      memoryPercent: 25,
      networkRxBytes: 15,
      networkTxBytes: 27,
      pids: 4,
    },
    createdAt: "2023-11-14T22:13:20.000Z",
    startedAt: "2026-08-01T00:00:00.000Z",
  });
});

test("keeps missing Docker capabilities explicit", () => {
  const container = normalizeDockerContainer({ Id: "stopped", Names: ["/stopped"], State: "exited" }, {
    Id: "stopped",
    State: { Status: "exited" },
  });

  assert.equal(container?.health, "none");
  assert.deepEqual(container?.compose, { project: null, service: null });
  assert.deepEqual(container?.ports, []);
  assert.equal(container?.resources, null);
  assert.equal(normalizeDockerStats({}), null);
});

test("returns an honest unavailable snapshot when no adapter is configured", async () => {
  const snapshot = await collectDockerSnapshot({ discoveryUrl: "" });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.status, "unavailable");
  assert.deepEqual(snapshot.containers, []);
  assert.match(snapshot.warnings[0], /no Docker socket is mounted/);
});

test("collects containers through only the read-only Docker API paths", async () => {
  const calls: Array<{ url: string; authorization: string | undefined }> = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ url, authorization: headers?.Authorization });
    const payload = url.includes("/containers/json")
      ? [{ Id: "running", Names: ["/running"], Image: "demo:latest", State: "running", Ports: [] }]
      : url.includes("/stats?")
        ? { memory_stats: { usage: 1, limit: 2 } }
        : { Id: "running", Name: "/running", State: { Status: "running" }, Config: {} };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const snapshot = await collectDockerSnapshot({
    discoveryUrl: "http://docker-adapter:2375",
    token: "adapter-token",
    fetcher,
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.containers[0]?.id, "running");
  assert.deepEqual(calls.map((call) => call.url), [
    "http://docker-adapter:2375/containers/json?all=true",
    "http://docker-adapter:2375/containers/running/json",
    "http://docker-adapter:2375/containers/running/stats?stream=false",
  ]);
  assert.ok(calls.every((call) => call.authorization === "Bearer adapter-token"));
});
