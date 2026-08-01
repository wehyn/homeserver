export const serviceStatuses = ["online", "degraded", "offline", "unknown"] as const;
export type ServiceStatus = (typeof serviceStatuses)[number];

export const containerStates = ["created", "running", "paused", "restarting", "exited", "dead", "unknown"] as const;
export type ContainerState = (typeof containerStates)[number];

export const containerHealthStatuses = ["healthy", "unhealthy", "starting", "none", "unknown"] as const;
export type ContainerHealthStatus = (typeof containerHealthStatuses)[number];

export const backupStatuses = ["success", "warning", "failed", "in-progress", "unknown", "never"] as const;
export type BackupStatus = (typeof backupStatuses)[number];

export type ServiceObservationInput = {
  serviceId: string;
  status: ServiceStatus;
  latencyMs?: number;
  observedAt?: string;
  source?: string;
};

export type ServiceObservation = ServiceObservationInput & {
  observedAt: string;
  source: string;
};

export type ServiceStatusEvent = {
  id: number;
  serviceId: string;
  status: ServiceStatus;
  latencyMs?: number;
  observedAt: string;
  source: string;
};

export type ServiceLatencyObservation = {
  id: number;
  serviceId: string;
  status: ServiceStatus;
  latencyMs: number;
  observedAt: string;
  source: string;
};

export type ServiceDependencyInput = {
  serviceId: string;
  dependsOnServiceId: string;
  label?: string;
  critical?: boolean;
};

export type ServiceDependency = ServiceDependencyInput & {
  critical: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContainerStateInput = {
  serviceId: string;
  state: ContainerState;
  healthStatus?: ContainerHealthStatus;
  containerId?: string;
  containerName?: string;
  image?: string;
  restartCount?: number;
  startedAt?: string;
  finishedAt?: string;
  observedAt?: string;
  source?: string;
};

export type ServiceContainerState = Omit<ContainerStateInput, "healthStatus" | "restartCount" | "observedAt" | "source"> & {
  healthStatus: ContainerHealthStatus;
  restartCount: number;
  observedAt: string;
  source: string;
  updatedAt: string;
};

export type BackupMetadataInput = {
  serviceId: string;
  status: BackupStatus;
  lastBackupAt?: string;
  provider?: string;
  reference?: string;
  message?: string;
  observedAt?: string;
};

export type ServiceBackupMetadata = Omit<BackupMetadataInput, "observedAt"> & {
  observedAt: string;
  updatedAt: string;
};

export type LatencySummary = {
  observationCount: number;
  averageMs?: number;
  p95Ms?: number;
  lastMs?: number;
  lastObservedAt?: string;
  historyTruncated: boolean;
};

export type AvailabilitySummary = {
  windowStart: string;
  windowEnd: string;
  totalSeconds: number;
  onlineSeconds: number;
  degradedSeconds: number;
  offlineSeconds: number;
  unknownSeconds: number;
  uptimePercent: number;
  availabilityPercent: number;
  coveragePercent: number;
  currentStatus: ServiceStatus;
  historyTruncated: boolean;
};

export type ServiceObservations = {
  statusHistory: ServiceStatusEvent[];
  latencyHistory: ServiceLatencyObservation[];
};

export type ServiceOperations = ServiceObservations & {
  serviceId: string;
  latency: LatencySummary;
  availability: AvailabilitySummary;
  dependencies: ServiceDependency[];
  containerState?: ServiceContainerState;
  backup?: ServiceBackupMetadata;
};

export type RecordObservationResult = {
  observation: ServiceObservation;
  previousStatus?: ServiceStatus;
  statusTransitionRecorded: boolean;
  latencyObservationRecorded: boolean;
};
