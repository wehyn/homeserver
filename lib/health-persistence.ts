export type HealthPersistenceSnapshot = {
  rowVersion: number;
  recordGeneration: string;
  target: string;
  allowInsecureTls: boolean;
  url: string;
  healthUrl: string | null;
  casaosScheme: string | null;
  casaosHostname: string | null;
  casaosPortMap: string | null;
  casaosIndex: string | null;
};

export type HealthPersistenceRow = Omit<HealthPersistenceSnapshot, "target">;

export function createHealthPersistenceSnapshot(row: HealthPersistenceRow, target: string) {
  return { ...row, target } satisfies HealthPersistenceSnapshot;
}

export function canPersistHealthResult(started: HealthPersistenceSnapshot, current: HealthPersistenceSnapshot | undefined) {
  return current !== undefined
    && started.rowVersion === current.rowVersion
    && started.recordGeneration === current.recordGeneration
    && started.target === current.target
    && started.allowInsecureTls === current.allowInsecureTls
    && started.url === current.url
    && started.healthUrl === current.healthUrl
    && started.casaosScheme === current.casaosScheme
    && started.casaosHostname === current.casaosHostname
    && started.casaosPortMap === current.casaosPortMap
    && started.casaosIndex === current.casaosIndex;
}
