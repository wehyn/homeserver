import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

type ProcessRecord = {
  pid: number;
  name: string;
  command: string;
  user: string;
  rssBytes: number;
  memoryPercent: number;
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

type ProcessDetails = {
  name: string;
  uid: number;
  rssBytes: number;
  command: string;
};

const procRoot = process.env.PROC_ROOT || "/host/proc";
const passwdPath = process.env.PASSWD_PATH || "/host/etc/passwd";
const port = Number(process.env.AGENT_PORT || 8787);
const sharedToken = process.env.MEMORY_AGENT_TOKEN || "";

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

  let entries;
  try {
    entries = await readdir(currentProcRoot, { withFileTypes: true });
  } catch {
    throw new Error(`Unable to read process directory: ${currentProcRoot}`);
  }

  const processIds = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name));

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

async function readProcess(currentProcRoot: string, pid: number, users: Map<number, string>, totalBytes: number): Promise<ProcessRecord> {
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
  };
}

function readStatusValue(status: string, key: string) {
  const line = status.split("\n").find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim() || "";
}

function isAuthorized(request: IncomingMessage) {
  if (!sharedToken) return true;
  return request.headers.authorization === `Bearer ${sharedToken}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function startServer() {
  const server = createServer(async (request, response) => {
    if (request.url === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.url !== "/v1/memory/processes" || request.method !== "GET") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    try {
      sendJson(response, 200, await collectSnapshot());
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Unable to collect memory metrics" });
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Nimbus metrics agent listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
