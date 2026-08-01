export type AppStatus = "online" | "degraded" | "offline" | "unknown";
export type AppSource = "manual" | "docker";
export type ActivityType = "app-created" | "app-updated" | "app-deleted" | "status-changed";

export type ManagedApp = {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  icon?: string;
  color: string;
  healthUrl?: string;
  allowInsecureTls?: boolean;
  status: AppStatus;
  source: AppSource;
  isFavorite: boolean;
  isVisible: boolean;
  sortOrder: number;
};

export type ActivityEvent = {
  id: number;
  type: ActivityType;
  appId?: string;
  appName: string;
  status?: AppStatus;
  createdAt: string;
};

export type ServerOverview = {
  uptime: string;
  cpu: number;
  cpuCores: number;
  memory: number;
  memoryUsed: string;
  memoryTotal: string;
  storage: number;
  storageUsed: string;
  storageAvailable: string;
  storageTotal: string;
  network: string;
  updatedAt: string;
};

export type MemoryProcess = {
  pid: number;
  name: string;
  command: string;
  user: string;
  rssBytes: number;
  memoryPercent: number;
};

export type MemorySnapshot = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  processes: MemoryProcess[];
  partial: boolean;
  omittedCount: number;
  warnings: string[];
  updatedAt: string;
};

export type CpuProcess = MemoryProcess & {
  cpuPercent: number;
};

export type ProcessorSnapshot = {
  cpuPercent: number;
  cpuCores: number;
  loadAverage: {
    one: number;
    five: number;
    fifteen: number;
  };
  processes: CpuProcess[];
  sampling: boolean;
  partial: boolean;
  omittedCount: number;
  warnings: string[];
  updatedAt: string;
};
