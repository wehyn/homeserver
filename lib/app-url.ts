import type { ManagedApp } from "./types";

export function resolveAppLaunchUrl(app: Pick<ManagedApp, "url" | "dockerDetails" | "containerId" | "dockerProject" | "dockerService">, currentHost?: string) {
  const host = currentHost?.trim();
  const isHostLocalService = Boolean(app.dockerDetails || app.containerId || app.dockerProject || app.dockerService);
  if (!host || !isHostLocalService) return app.url;

  try {
    const target = new URL(app.url);
    if (!["http:", "https:"].includes(target.protocol) || target.hostname === host) return app.url;
    target.hostname = host;
    return target.href;
  } catch {
    return app.url;
  }
}
