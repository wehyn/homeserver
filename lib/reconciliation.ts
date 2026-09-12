export type DockerMetadataState = {
  containerId?: string;
  containerName?: string;
  containerImage?: string;
  containerState?: string;
  containerHealth?: string;
  containerStartedAt?: string;
  containerObservedAt?: string;
  casaosScheme?: string;
  casaosHostname?: string;
  casaosPortMap?: string;
  casaosIndex?: string;
};

export function hasStaleDockerMetadata(app: DockerMetadataState) {
  return Boolean(app.containerId || app.containerName || app.containerImage || app.containerStartedAt || app.containerObservedAt
    || app.casaosScheme || app.casaosHostname || app.casaosPortMap || app.casaosIndex
    || (app.containerState && app.containerState !== "unknown")
    || (app.containerHealth && app.containerHealth !== "unknown"));
}
