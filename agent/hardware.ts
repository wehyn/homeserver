import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type HardwareSnapshot = {
  temperatureC: number | null;
  powerWatts: number | null;
  powerSource: "intel-rapl" | null;
  updatedAt: string;
};

type HardwareClock = () => number;
type EnergySample = { microjoules: number; timestampMs: number };

const SAMPLE_INTERVAL_MS = 5_000;
const CPU_THERMAL_TYPES = ["x86_pkg_temp", "cpu", "CPU", "soc"];

export class HardwareSampler {
  private readonly sysRoot: string;
  private readonly now: HardwareClock;
  private previousEnergySample: EnergySample | undefined;
  private snapshot: HardwareSnapshot | undefined;
  private sampledAt = 0;
  private pendingRefresh: Promise<HardwareSnapshot> | undefined;

  constructor(sysRoot = process.env.SYS_ROOT || "/host/sys", now: HardwareClock = Date.now) {
    this.sysRoot = sysRoot;
    this.now = now;
  }

  async getSnapshot(): Promise<HardwareSnapshot> {
    if (this.snapshot && this.now() - this.sampledAt < SAMPLE_INTERVAL_MS) return this.snapshot;
    return this.refresh();
  }

  async refresh(): Promise<HardwareSnapshot> {
    if (this.pendingRefresh) return this.pendingRefresh;

    this.pendingRefresh = this.readSnapshot().finally(() => {
      this.pendingRefresh = undefined;
    });
    return this.pendingRefresh;
  }

  private async readSnapshot(): Promise<HardwareSnapshot> {
    const timestampMs = this.now();
    const [temperatureC, energyMicrojoules] = await Promise.all([
      readCpuTemperature(this.sysRoot),
      readIntelPackageEnergy(this.sysRoot),
    ]);

    const power = calculatePower(energyMicrojoules, this.previousEnergySample, timestampMs);
    if (energyMicrojoules !== null) {
      this.previousEnergySample = { microjoules: energyMicrojoules, timestampMs };
    }

    this.snapshot = {
      temperatureC,
      powerWatts: power,
      powerSource: energyMicrojoules === null ? null : "intel-rapl",
      updatedAt: new Date(timestampMs).toISOString(),
    };
    this.sampledAt = timestampMs;
    return this.snapshot;
  }
}

export async function readCpuTemperature(sysRoot = "/sys"): Promise<number | null> {
  const thermalRoot = join(sysRoot, "devices", "virtual", "thermal");
  const entries = await readdir(thermalRoot, { withFileTypes: true }).catch(() => []);
  const zones = entries
    .filter((entry) => entry.isDirectory() && /^thermal_zone\d+$/.test(entry.name))
    .sort((left, right) => Number(left.name.slice(12)) - Number(right.name.slice(12)));

  for (const zone of zones) {
    const type = (await readText(join(thermalRoot, zone.name, "type")))?.trim() || "";
    if (!CPU_THERMAL_TYPES.some((candidate) => type.startsWith(candidate))) continue;
    const temperature = parseTemperature(await readText(join(thermalRoot, zone.name, "temp")));
    if (temperature !== null) return temperature;
  }

  return parseTemperature(await readText(join(sysRoot, "class", "hwmon", "hwmon0", "temp1_input")));
}

export async function readIntelPackageEnergy(sysRoot = "/sys"): Promise<number | null> {
  const value = await readText(join(
    sysRoot,
    "class",
    "powercap",
    "intel-rapl",
    "intel-rapl:0",
    "energy_uj",
  ));
  if (value === undefined) return null;
  const microjoules = Number(value.trim());
  return Number.isFinite(microjoules) && microjoules >= 0 ? microjoules : null;
}

export function calculatePower(
  currentMicrojoules: number | null,
  previous: EnergySample | undefined,
  timestampMs: number,
): number | null {
  if (currentMicrojoules === null || !previous) return null;
  const elapsedSeconds = (timestampMs - previous.timestampMs) / 1_000;
  const energyDelta = currentMicrojoules - previous.microjoules;
  if (elapsedSeconds <= 0 || energyDelta < 0) return null;
  return Number((energyDelta / 1_000_000 / elapsedSeconds).toFixed(2));
}

function parseTemperature(value: string | undefined): number | null {
  if (value === undefined) return null;
  const raw = Number(value.trim());
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw > 1_000 ? raw / 1_000 : raw);
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}
