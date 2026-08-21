import type { AppStatus, ManagedApp } from "@/lib/types";

export const statusCopy: Record<AppStatus, string> = {
  online: "Online",
  degraded: "Slow response",
  offline: "Offline",
  unknown: "Not checked",
};

export function blankApp(order: number): ManagedApp {
  return {
    id: `app-${Date.now()}`,
    name: "",
    description: "",
    category: "Productivity",
    url: "",
    icon: "",
    color: "#65e6a5",
    healthUrl: "",
    allowInsecureTls: false,
    status: "unknown",
    source: "manual",
    isFavorite: false,
    isVisible: true,
    sortOrder: order,
  };
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function formatTemperature(value: number | null) {
  return value === null ? "Unavailable" : `${value}°C`;
}

export function formatPower(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(2)} W`;
}

export function isAppStatus(value: unknown): value is AppStatus {
  return value === "online" || value === "degraded" || value === "offline" || value === "unknown";
}
