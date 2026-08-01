import { readFile, readdir } from "node:fs/promises";

export type HostTemperature = {
  id: string;
  label: string;
  celsius: number;
};

export type HostNetworkInterface = {
  name: string;
  state: string | null;
  receiveBytes: number | null;
  transmitBytes: number | null;
};

export type HostDisk = {
  name: string;
  state: string | null;
  readOnly: boolean | null;
  smart: "unavailable";
};

export type HostRaidArray = {
  name: string;
  state: string;
  detail: string;
};

export type HostCapability = {
  status: "available" | "unavailable";
  message: string;
};

export type HostTelemetrySnapshot = {
  schemaVersion: 1;
  available: boolean;
  status: "available" | "partial" | "unavailable";
  temperatures: HostTemperature[];
  network: HostNetworkInterface[];
  disks: HostDisk[];
  raid: HostRaidArray[];
  ups: HostCapability;
  warnings: string[];
  updatedAt: string;
};

type HostTelemetryRoots = {
  procRoot?: string;
  thermalRoot?: string;
  networkRoot?: string;
  blockRoot?: string;
};

const defaultProcRoot = process.env.PROC_ROOT || "/host/proc";
const defaultThermalRoot = process.env.SYS_THERMAL_ROOT || "/host/sys/class/thermal";
const defaultNetworkRoot = process.env.SYS_NETWORK_ROOT || "/host/sys/class/net";
const defaultBlockRoot = process.env.SYS_BLOCK_ROOT || "/host/sys/block";

export async function collectHostTelemetry(roots: HostTelemetryRoots = {}): Promise<HostTelemetrySnapshot> {
  const procRoot = roots.procRoot || defaultProcRoot;
  const thermalRoot = roots.thermalRoot || defaultThermalRoot;
  const networkRoot = roots.networkRoot || defaultNetworkRoot;
  const blockRoot = roots.blockRoot || defaultBlockRoot;
  const warnings: string[] = [];
  const [temperatures, network, disks, raid] = await Promise.all([
    readTemperatures(thermalRoot, warnings),
    readNetwork(networkRoot, warnings),
    readDisks(blockRoot, warnings),
    readRaid(`${procRoot}/mdstat`, warnings),
  ]);
  const available = temperatures.length > 0 || network.length > 0 || disks.length > 0 || raid.length > 0;
  return {
    schemaVersion: 1,
    available,
    status: !available ? "unavailable" : warnings.length ? "partial" : "available",
    temperatures,
    network,
    disks,
    raid,
    ups: { status: "unavailable", message: "UPS telemetry requires a host adapter or NUT integration." },
    warnings: [...new Set(warnings)],
    updatedAt: new Date().toISOString(),
  };
}

async function readTemperatures(root: string, warnings: string[]) {
  const entries = await readDirectories(root);
  if (!entries) {
    warnings.push("Host temperature sensors are unavailable.");
    return [];
  }
  const values = await Promise.all(entries.filter((entry) => entry.startsWith("thermal_zone")).map(async (id) => {
    const raw = await readFile(`${root}/${id}/temp`, "utf8").catch(() => null);
    if (raw === null || !raw.trim()) return null;
    const value = Number(raw.trim());
    if (!Number.isFinite(value)) return null;
    const label = (await readFile(`${root}/${id}/type`, "utf8").catch(() => id)).trim() || id;
    const celsius = value > 1_000 ? value / 1_000 : value;
    return { id, label, celsius: Number(celsius.toFixed(1)) } satisfies HostTemperature;
  }));
  const result = values.filter((value): value is HostTemperature => value !== null);
  if (!result.length) warnings.push("No readable host temperature sensors were found.");
  return result;
}

async function readNetwork(root: string, warnings: string[]) {
  const entries = await readDirectories(root);
  if (!entries) {
    warnings.push("Host network counters are unavailable.");
    return [];
  }
  const values = await Promise.all(entries.map(async (name) => {
    const [state, receiveBytes, transmitBytes] = await Promise.all([
      readText(`${root}/${name}/operstate`),
      readNonNegativeNumber(`${root}/${name}/statistics/rx_bytes`),
      readNonNegativeNumber(`${root}/${name}/statistics/tx_bytes`),
    ]);
    if (receiveBytes === null && transmitBytes === null && state === null) return null;
    return { name, state, receiveBytes, transmitBytes } satisfies HostNetworkInterface;
  }));
  const result = values.filter((value): value is HostNetworkInterface => value !== null);
  if (!result.length) warnings.push("No readable host network interfaces were found.");
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

async function readDisks(root: string, warnings: string[]) {
  const entries = await readDirectories(root);
  if (!entries) {
    warnings.push("Host disk state is unavailable.");
    return [];
  }
  const values = await Promise.all(entries.map(async (name) => {
    const [state, readOnly] = await Promise.all([
      readText(`${root}/${name}/device/state`),
      readBoolean(`${root}/${name}/ro`),
    ]);
    if (state === null && readOnly === null) return null;
    return { name, state, readOnly, smart: "unavailable" } satisfies HostDisk;
  }));
  const result = values.filter((value): value is HostDisk => value !== null);
  if (!result.length) warnings.push("No readable host disk state was found.");
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

async function readRaid(path: string, warnings: string[]) {
  const content = await readFile(path, "utf8").catch(() => null);
  if (content === null) {
    warnings.push("Linux software RAID status is unavailable.");
    return [];
  }
  const arrays: HostRaidArray[] = [];
  for (const line of content.split("\n")) {
    const match = /^(md\w+)\s+:\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!match) continue;
    arrays.push({ name: match[1], state: match[2], detail: match[3].trim() });
  }
  return arrays;
}

async function readDirectories(root: string) {
  try {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return null;
  }
}

async function readText(path: string) {
  const value = await readFile(path, "utf8").catch(() => null);
  return value === null ? null : value.trim() || null;
}

async function readNonNegativeNumber(path: string) {
  const raw = await readText(path);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoolean(path: string) {
  const value = await readText(path);
  return value === null ? null : value === "1";
}
