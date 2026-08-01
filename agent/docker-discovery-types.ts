export type DockerContainerState =
  | "created"
  | "restarting"
  | "running"
  | "removing"
  | "paused"
  | "exited"
  | "dead"
  | "unknown";

export type DockerHealthState = "healthy" | "unhealthy" | "starting" | "none" | "unknown";

export type DockerPort = {
  containerPort: number;
  protocol: "tcp" | "udp" | "sctp" | "unknown";
  hostIp: string | null;
  hostPort: number | null;
};

export type DockerResourceUsage = {
  cpuPercent: number | null;
  memoryUsageBytes: number | null;
  memoryLimitBytes: number | null;
  memoryPercent: number | null;
  networkRxBytes: number | null;
  networkTxBytes: number | null;
  pids: number | null;
};

export type DockerContainer = {
  id: string;
  name: string;
  image: string | null;
  compose: {
    project: string | null;
    service: string | null;
  };
  labels: Record<string, string>;
  state: DockerContainerState;
  statusText: string | null;
  health: DockerHealthState;
  ports: DockerPort[];
  resources: DockerResourceUsage | null;
  createdAt: string | null;
  startedAt: string | null;
};

export type DockerDiscoveryStatus = "available" | "partial" | "unavailable";

export type DockerDiscoveryResponse = {
  schemaVersion: 1;
  available: boolean;
  status: DockerDiscoveryStatus;
  source: "read-only-agent" | "unavailable";
  containers: DockerContainer[];
  warnings: string[];
  updatedAt: string;
};
