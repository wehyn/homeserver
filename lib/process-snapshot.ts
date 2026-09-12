import type { MemoryProcess, MemorySnapshot, ProcessorSnapshot } from "./types.ts";

export const PROCESS_RESPONSE_LIMIT = 256;
export const MAX_PROCESS_RESPONSE_BYTES = 512 * 1024;
const PROCESS_STRING_LIMIT = 180;
const WARNING_STRING_LIMIT = 180;
const WARNING_COUNT_LIMIT = 32;
const POLICY_REASONS = new Set(["process-limit", "scan-limit", "scan-and-process-limit"]);

type ProcessCollection = {
  processes: Array<MemoryProcess | (MemoryProcess & { cpuPercent: number })>;
  totalCount: unknown;
  returnedCount: unknown;
  unreadableCount: unknown;
  policyOmittedCount: unknown;
  policyOmittedReason: unknown;
};

export function isMemorySnapshot(value: unknown): value is MemorySnapshot {
  if (!isRecord(value)) return false;
  const snapshot = value as Partial<MemorySnapshot>;
  return isFiniteNumber(snapshot.totalBytes) && snapshot.totalBytes > 0
    && isFiniteNumber(snapshot.usedBytes) && snapshot.usedBytes >= 0
    && isFiniteNumber(snapshot.availableBytes) && snapshot.availableBytes >= 0
    && isFiniteNumber(snapshot.usedPercent) && snapshot.usedPercent >= 0 && snapshot.usedPercent <= 100
    && isValidProcessCollection(snapshot)
    && typeof snapshot.partial === "boolean"
    && isInteger(snapshot.omittedCount) && snapshot.omittedCount >= 0
    && Array.isArray(snapshot.warnings) && snapshot.warnings.length <= WARNING_COUNT_LIMIT
    && snapshot.warnings.every(isBoundedString)
    && typeof snapshot.updatedAt === "string" && snapshot.updatedAt.length > 0;
}

export function isProcessorSnapshot(value: unknown): value is ProcessorSnapshot {
  if (!isRecord(value)) return false;
  const snapshot = value as Partial<ProcessorSnapshot>;
  return isFiniteNumber(snapshot.cpuPercent) && snapshot.cpuPercent >= 0 && snapshot.cpuPercent <= 100
    && isInteger(snapshot.cpuCores) && snapshot.cpuCores > 0
    && isRecord(snapshot.loadAverage)
    && isFiniteNumber(snapshot.loadAverage.one) && snapshot.loadAverage.one >= 0
    && isFiniteNumber(snapshot.loadAverage.five) && snapshot.loadAverage.five >= 0
    && isFiniteNumber(snapshot.loadAverage.fifteen) && snapshot.loadAverage.fifteen >= 0
    && isValidProcessCollection(snapshot)
    && typeof snapshot.sampling === "boolean"
    && typeof snapshot.partial === "boolean"
    && isInteger(snapshot.omittedCount) && snapshot.omittedCount >= 0
    && Array.isArray(snapshot.warnings) && snapshot.warnings.length <= WARNING_COUNT_LIMIT
    && snapshot.warnings.every(isBoundedString)
    && typeof snapshot.updatedAt === "string" && snapshot.updatedAt.length > 0
    && snapshot.processes.every((process) => isFiniteNumber(process.cpuPercent) && process.cpuPercent >= 0 && process.cpuPercent <= 100);
}

export async function readJsonWithinLimit(response: Response, maxBytes = MAX_PROCESS_RESPONSE_BYTES): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}

function isValidProcessCollection(value: Partial<ProcessCollection>): value is ProcessCollection {
  if (!Array.isArray(value.processes) || value.processes.length > PROCESS_RESPONSE_LIMIT) return false;
  if (!isInteger(value.totalCount) || value.totalCount < 0) return false;
  if (!isInteger(value.returnedCount) || value.returnedCount !== value.processes.length || value.returnedCount > value.totalCount) return false;
  if (!isInteger(value.unreadableCount) || value.unreadableCount < 0) return false;
  if (!isInteger(value.policyOmittedCount) || value.policyOmittedCount < 0) return false;
  if (!POLICY_REASONS.has(value.policyOmittedReason as string) && value.policyOmittedReason !== null) return false;
  if (value.policyOmittedCount === 0 && value.policyOmittedReason !== null) return false;
  if (value.policyOmittedCount > 0 && value.policyOmittedReason === null) return false;
  if (value.returnedCount + value.unreadableCount + value.policyOmittedCount !== value.totalCount) return false;
  return value.processes.every((process) => isInteger(process.pid) && process.pid >= 0
    && isBoundedString(process.name) && isBoundedString(process.command) && isBoundedString(process.user)
    && isFiniteNumber(process.rssBytes) && process.rssBytes >= 0
    && isFiniteNumber(process.memoryPercent) && process.memoryPercent >= 0 && process.memoryPercent <= 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= Math.max(PROCESS_STRING_LIMIT, WARNING_STRING_LIMIT);
}
