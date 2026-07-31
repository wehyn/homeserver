export type AppStatus = "online" | "degraded" | "offline" | "unknown";
export type AppSource = "manual" | "docker";

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

export type ServerOverview = {
  uptime: string;
  cpu: number;
  memory: number;
  storage: number;
  network: string;
};
