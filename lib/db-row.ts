import type { ManagedApp } from "./types";

export function toDatabaseRow(app: ManagedApp) {
  const { dockerDetails: _dockerDetails, ...persistedApp } = app;
  return {
    ...persistedApp,
    icon: persistedApp.icon ?? null,
    healthUrl: persistedApp.healthUrl ?? null,
    allowInsecureTls: persistedApp.allowInsecureTls ? 1 : 0,
    isFavorite: persistedApp.isFavorite ? 1 : 0,
    isVisible: persistedApp.isVisible ? 1 : 0,
    dockerProject: persistedApp.dockerProject ?? null,
    dockerService: persistedApp.dockerService ?? null,
    containerId: persistedApp.containerId ?? null,
    containerName: persistedApp.containerName ?? null,
    containerImage: persistedApp.containerImage ?? null,
    containerState: persistedApp.containerState ?? "unknown",
    containerHealth: persistedApp.containerHealth ?? "unknown",
    containerStartedAt: persistedApp.containerStartedAt ?? null,
    containerObservedAt: persistedApp.containerObservedAt ?? null,
    casaosScheme: persistedApp.casaosScheme ?? null,
    casaosHostname: persistedApp.casaosHostname ?? null,
    casaosPortMap: persistedApp.casaosPortMap ?? null,
    casaosIndex: persistedApp.casaosIndex ?? null,
  };
}
