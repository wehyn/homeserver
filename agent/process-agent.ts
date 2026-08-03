import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { collectDockerSnapshot } from "./docker-discovery.ts";
import { HardwareSampler } from "./hardware.js";

type ProcessRecord = {
  pid: number;
  name: string;
  command: string;
  user: string;
  rssBytes: number;
  memoryPercent: number;
};

type CpuProcessRecord = ProcessRecord & {
  cpuPercent: number;
};

export type MemorySnapshot = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  processes: ProcessRecord[];
  partial: boolean;
  omittedCount: number;
  warnings: string[];
  updatedAt: string;
};

export type ProcessorSnapshot = {
  cpuPercent: number;
  cpuCores: number;
  loadAverage: {
    one: number;
    five: number;
    fifteen: number;
  };
  processes: CpuProcessRecord[];
  sampling: boolean;
  partial: boolean;
  omittedCount: number;
  warnings: string[];
  updatedAt: string;
};

type ProcessDetails = {
  name: string;
  uid: number;
  rssBytes: number;
  command: string;
};

type CpuSample = {
  totalTicks: number;
  idleTicks: number;
  cpuCores: number;
  loadAverage: { one: number; five: number; fifteen: number };
  processTicks: Map<number, number>;
  processIds: number[];
  omittedCount: number;
  warnings: string[];
};

const procRoot = process.env.PROC_ROOT || "/host/proc";
const passwdPath = process.env.PASSWD_PATH || "/host/etc/passwd";
const port = Number(process.env.AGENT_PORT || 8787);
const sharedToken = process.env.MEMORY_AGENT_TOKEN || "";
const dockerToken = process.env.DOCKER_AGENT_TOKEN || sharedToken;
let previousCpuSample: CpuSample | undefined;
const hardwareSampler = new HardwareSampler();

export async function collectSnapshot(
  roots: { procRoot?: string; passwdPath?: string } = {},
): Promise<MemorySnapshot> {
  const currentProcRoot = roots.procRoot || procRoot;
  const currentPasswdPath = roots.passwdPath || passwdPath;
  const warnings: string[] = [];
  const memory = await readMemory(currentProcRoot);
  const users = await readUsers(currentPasswdPath, warnings);
  const processes: ProcessRecord[] = [];
  let omittedCount = 0;
  const processIds = await listProcessIds(currentProcRoot);

  const results = await Promise.all(processIds.map(async (pid) => {
    try {
      return await readProcess(currentProcRoot, pid, users, memory.totalBytes);
    } catch {
      return null;
    }
  }));

  for (const result of results) {
    if (result) processes.push(result);
    else omittedCount += 1;
  }

  if (omittedCount) {
    warnings.push(`${omittedCount} process${omittedCount === 1 ? " was" : "es were"} unavailable while scanning.`);
  }

  processes.sort((left, right) => right.rssBytes - left.rssBytes || left.name.localeCompare(right.name));
  return {
    ...memory,
    processes,
    partial: warnings.length > 0,
    omittedCount,
    warnings,
    updatedAt: new Date().toISOString(),
  };
}

export async function collectProcessorSnapshot(
  roots: { procRoot?: string; passwdPath?: string } = {},
): Promise<ProcessorSnapshot> {
  const currentProcRoot = roots.procRoot || procRoot;
  const currentPasswdPath = roots.passwdPath || passwdPath;
  const firstSample = await readCpuSample(currentProcRoot);
  const memory = await readMemory(currentProcRoot);
  const baseline = previousCpuSample;
  let currentSample = firstSample;
  let sampling = !baseline;
  const warnings = [...firstSample.warnings];
  let omittedCount = firstSample.omittedCount;

  if (!baseline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    currentSample = await readCpuSample(currentProcRoot);
    warnings.push(...currentSample.warnings);
    omittedCount += currentSample.omittedCount;
  }

  previousCpuSample = currentSample;
  const totalDelta = currentSample.totalTicks - (baseline?.totalTicks || firstSample.totalTicks);
  const idleDelta = currentSample.idleTicks - (baseline?.idleTicks || firstSample.idleTicks);
  const cpuPercent = calculateCpuPercent(totalDelta, idleDelta);
  const users = await readUsers(currentPasswdPath, warnings);
  const processes: CpuProcessRecord[] = [];

  const results = await Promise.all(currentSample.processIds.map(async (pid) => {
    try {
      const processTicks = currentSample.processTicks.get(pid) || 0;
      const baselineTicks = baseline?.processTicks.get(pid) || firstSample.processTicks.get(pid) || processTicks;
      const processDelta = Math.max(0, processTicks - baselineTicks);
      const processCpuPercent = calculateProcessCpuPercent(processDelta, totalDelta);
      return await readProcess(currentProcRoot, pid, users, memory.totalBytes, processCpuPercent);
    } catch {
      return null;
    }
  }));

  for (const result of results) {
    if (result) processes.push(result as CpuProcessRecord);
    else omittedCount += 1;
  }

  if (omittedCount) {
    warnings.push(`${omittedCount} process${omittedCount === 1 ? " was" : "es were"} unavailable while scanning.`);
  }

  return {
    cpuPercent,
    cpuCores: currentSample.cpuCores,
    loadAverage: currentSample.loadAverage,
    processes: processes.sort((left, right) => right.cpuPercent - left.cpuPercent || left.name.localeCompare(right.name)),
    sampling,
    partial: warnings.length > 0,
    omittedCount,
    warnings: [...new Set(warnings)],
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeCommand(rawCommand: string, fallbackName: string): string {
  const args = rawCommand.split("\0").filter(Boolean);
  if (!args.length) return fallbackName;

  const sanitized: string[] = [];
  let redactNext = false;
  for (const [index, arg] of args.entries()) {
    if (redactNext) {
      sanitized.push("<redacted>");
      redactNext = false;
      continue;
    }

    const keyMatch = /^--?(?:password|passwd|pass|token|secret|api[-_]?key|access[-_]?key|auth|credential)(?:=|$)/i.test(arg);
    if (keyMatch) {
      sanitized.push(arg.includes("=") ? `${arg.slice(0, arg.indexOf("=") + 1)}<redacted>` : `${arg}=<redacted>`);
      if (!arg.includes("=")) redactNext = true;
      continue;
    }

    sanitized.push(index === 0 ? basename(arg) : arg);
  }

  const command = sanitized.join(" ").trim();
  return command.length > 180 ? `${command.slice(0, 177)}...` : command || fallbackName;
}

async function listProcessIds(currentProcRoot: string) {
  let entries;
  try {
    entries = await readdir(currentProcRoot, { withFileTypes: true });
  } catch {
    throw new Error(`Unable to read process directory: ${currentProcRoot}`);
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name));
}

async function readCpuSample(currentProcRoot: string): Promise<CpuSample> {
  const [stat, loadAverage, processIds] = await Promise.all([
    readFile(`${currentProcRoot}/stat`, "utf8"),
    readFile(`${currentProcRoot}/loadavg`, "utf8"),
    listProcessIds(currentProcRoot),
  ]);
  const cpuLine = stat.split("\n").find((line) => line.startsWith("cpu "));
  if (!cpuLine) throw new Error("Unable to read aggregate CPU statistics.");

  const cpuValues = cpuLine.trim().split(/\s+/).slice(1, 9).map(Number);
  const totalTicks = cpuValues.reduce((sum, value) => sum + value, 0);
  const idleTicks = (cpuValues[3] || 0) + (cpuValues[4] || 0);
  const cpuCores = stat.split("\n").filter((line) => /^cpu\d+\s/.test(line)).length;
  const loadValues = loadAverage.trim().split(/\s+/).slice(0, 3).map(Number);
  const processResults = await Promise.all(processIds.map(async (pid) => {
    try {
      return { pid, ticks: parseProcessTicks(await readFile(`${currentProcRoot}/${pid}/stat`, "utf8")) };
    } catch {
      return null;
    }
  }));
  const processTicks = new Map<number, number>();
  for (const result of processResults) {
    if (result) processTicks.set(result.pid, result.ticks);
  }
  const omittedCount = processResults.length - processTicks.size;
  return {
    totalTicks,
    idleTicks,
    cpuCores: cpuCores || 1,
    loadAverage: { one: loadValues[0] || 0, five: loadValues[1] || 0, fifteen: loadValues[2] || 0 },
    processTicks,
    processIds: [...processTicks.keys()],
    omittedCount,
    warnings: omittedCount ? [`${omittedCount} process${omittedCount === 1 ? " was" : "es were"} unavailable while sampling CPU.`] : [],
  };
}

function parseProcessTicks(stat: string) {
  const closingParen = stat.lastIndexOf(")");
  if (closingParen < 0) throw new Error("Invalid process statistics.");
  const fields = stat.slice(closingParen + 1).trim().split(/\s+/);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) throw new Error("Invalid process CPU statistics.");
  return userTicks + systemTicks;
}

export function calculateCpuPercent(totalDelta: number, idleDelta: number) {
  return totalDelta > 0 ? toPercent(((totalDelta - idleDelta) / totalDelta) * 100) : 0;
}

export function calculateProcessCpuPercent(processDelta: number, totalDelta: number) {
  return totalDelta > 0 ? toPercent((Math.max(0, processDelta) / totalDelta) * 100) : 0;
}

async function readMemory(currentProcRoot: string) {
  const meminfo = await readFile(`${currentProcRoot}/meminfo`, "utf8");
  const values = new Map<string, number>();
  for (const line of meminfo.split("\n")) {
    const match = /^(\w+):\s+(\d+)/.exec(line);
    if (match) values.set(match[1], Number(match[2]) * 1024);
  }

  const totalBytes = values.get("MemTotal") || 0;
  const availableBytes = values.get("MemAvailable") || values.get("MemFree") || 0;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
  };
}

async function readUsers(currentPasswdPath: string, warnings: string[]) {
  const users = new Map<number, string>();
  try {
    const passwd = await readFile(currentPasswdPath, "utf8");
    for (const line of passwd.split("\n")) {
      const fields = line.split(":");
      const uid = Number(fields[2]);
      if (fields[0] && Number.isFinite(uid)) users.set(uid, fields[0]);
    }
  } catch {
    warnings.push("Host user names are unavailable; process owners are shown as UIDs.");
  }
  return users;
}

async function readProcess(currentProcRoot: string, pid: number, users: Map<number, string>, totalBytes: number, cpuPercent?: number): Promise<ProcessRecord | CpuProcessRecord> {
  const status = await readFile(`${currentProcRoot}/${pid}/status`, "utf8");
  const name = readStatusValue(status, "Name") || `PID ${pid}`;
  const uid = Number((readStatusValue(status, "Uid") || "").split(/\s+/)[0]);
  const rssKb = Number((readStatusValue(status, "VmRSS") || "0").split(/\s+/)[0]);
  const command = await readFile(`${currentProcRoot}/${pid}/cmdline`, "utf8").catch(() => "");
  const details: ProcessDetails = { name, uid, rssBytes: Math.max(0, rssKb) * 1024, command };
  return {
    pid,
    name: details.name,
    command: sanitizeCommand(details.command, details.name),
    user: users.get(details.uid) || `uid:${details.uid}`,
    rssBytes: details.rssBytes,
    memoryPercent: totalBytes ? Number(((details.rssBytes / totalBytes) * 100).toFixed(2)) : 0,
    ...(cpuPercent !== undefined ? { cpuPercent } : {}),
  } as ProcessRecord | CpuProcessRecord;
}

function readStatusValue(status: string, key: string) {
  const line = status.split("\n").find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim() || "";
}

function toPercent(value: number) {
  return Number(Math.max(0, value).toFixed(2));
}

function isAuthorized(request: IncomingMessage, pathname: string) {
  const token = pathname === "/v1/docker/containers" ? dockerToken : sharedToken;
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function startServer() {
  const server = createServer(async (request, response) => {
    const requestPath = new URL(request.url || "/", "http://localhost").pathname;
    if (requestPath === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method !== "GET" || !["/v1/hardware", "/v1/memory/processes", "/v1/processor/processes", "/v1/docker/containers"].includes(requestPath)) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!isAuthorized(request, requestPath)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const data = requestPath === "/v1/hardware"
        ? await hardwareSampler.getSnapshot()
        : requestPath === "/v1/processor/processes"
          ? await collectProcessorSnapshot()
          : requestPath === "/v1/docker/containers"
          ? await collectDockerSnapshot()
          : await collectSnapshot();
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Unable to collect system metrics" });
    }
  });

  const hardwareTimer = setInterval(() => {
    void hardwareSampler.refresh();
  }, 5_000);
  hardwareTimer.unref();
  void hardwareSampler.refresh();
  server.on("close", () => clearInterval(hardwareTimer));

  server.listen(port, "0.0.0.0", () => {
    console.log(`Nimbus metrics agent listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
