import type { DockerContainer, DockerDiscoveryResponse, DockerResourceUsage } from "./docker-discovery";
import type { HostTelemetrySnapshot } from "@/agent/host-telemetry";

export type DockerResourcePoint = DockerResourceUsage & {
  observedAt: string;
};

export type DockerContainerTelemetry = DockerContainer & {
  history: DockerResourcePoint[];
};

export type TelemetryResponse = {
  schemaVersion: 1;
  status: "available" | "partial" | "unavailable";
  host: HostTelemetrySnapshot | null;
  docker: DockerDiscoveryResponse;
  containers: DockerContainerTelemetry[];
  warnings: string[];
  updatedAt: string;
};
