import type { AppStatus, ManagedApp } from "./types.ts";

export type HealthResult = {
  id: string;
  target: string;
  status: AppStatus;
};

export function applyHealthResults(apps: ManagedApp[], results: readonly HealthResult[], checkedApps: readonly ManagedApp[]) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const checkedAppById = new Map(checkedApps.map((app) => [app.id, app]));
  let changed = false;
  const next = apps.map((app) => {
    const result = resultById.get(app.id);
    const checkedApp = checkedAppById.get(app.id);
    if (!result || !checkedApp || healthTarget(checkedApp) !== healthTarget(app) || result.target !== healthTarget(checkedApp) || app.status === result.status) return app;
    changed = true;
    return { ...app, status: result.status };
  });
  return changed ? next : apps;
}

function healthTarget(app: Pick<ManagedApp, "healthUrl" | "url">) {
  return app.healthUrl || app.url;
}
