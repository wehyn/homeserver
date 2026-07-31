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
