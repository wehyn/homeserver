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

export type DockerVolume = {
  type: "bind" | "volume" | "tmpfs" | "unknown";
  source: string | null;
  target: string;
  mode: string | null;
};

export type DockerEnvironmentVariable = {
  name: string;
  value: string;
};

export type DockerServiceDetails = {
  image: string | null;
  networks: string[];
  ports: DockerPort[];
  volumes: DockerVolume[];
  environment: DockerEnvironmentVariable[];
};

export type CasaOSWebUI = {
  scheme: "http" | "https";
  hostname: string;
  portMap: string;
  index: string;
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
  casaos: CasaOSWebUI | null;
  ports: DockerPort[];
  networks?: string[];
  volumes?: DockerVolume[];
  environment?: DockerEnvironmentVariable[];
  createdAt: string | null;
  startedAt: string | null;
};

export type DockerDiscoveryStatus = "available" | "partial" | "unavailable";

export type DockerDiscoveryResponse = {
  schemaVersion: 1;
  available: boolean;
  status: DockerDiscoveryStatus;
  source: "read-only-agent" | "unavailable";
  servicesRoot: string | null;
  containers: DockerContainer[];
  warnings: string[];
  updatedAt: string;
};
