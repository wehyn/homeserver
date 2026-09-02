import type { AppStatus } from "./types.ts";

export type HealthResponse = {
  status: AppStatus;
  latency?: number;
  statusCode?: number;
};

export type HealthResponseResult =
  | { kind: "valid"; response: HealthResponse }
  | { kind: "api-error"; message: string }
  | { kind: "malformed"; message: string };

export type HealthTransportResult = HealthResponseResult | { kind: "transport-error"; message: string };

type HealthFetchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

const appStatuses = new Set<AppStatus>(["online", "degraded", "offline", "unknown"]);

export async function fetchHealthStatus(url: string, options: HealthFetchOptions = {}): Promise<HealthTransportResult> {
  const fetcher = options.fetcher || fetch;
  let response: Response;
  try {
    response = await fetcher(url, { signal: options.signal });
  } catch (caught) {
    if (options.signal?.aborted) throw caught;
    return classifyHealthTransportError(caught);
  }

  if (!response.ok) return validateHealthResponse(response, undefined);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "malformed", message: "Health API returned an invalid response." };
  }
  return validateHealthResponse(response, payload);
}

export function validateHealthResponse(response: Pick<Response, "ok" | "status"> | { ok: boolean; status: number }, payload: unknown): HealthResponseResult {
  if (!response.ok) {
    return { kind: "api-error", message: `Health API returned HTTP ${response.status}.` };
  }
  if (!isRecord(payload) || !appStatuses.has(payload.status as AppStatus)) {
    return { kind: "malformed", message: "Health API returned an invalid response." };
  }
  if (payload.latency !== undefined && (!isFiniteNumber(payload.latency) || payload.latency < 0)) {
    return { kind: "malformed", message: "Health API returned an invalid response." };
  }
  const statusCode = payload.statusCode;
  if (statusCode !== undefined && !isValidStatusCode(statusCode)) {
    return { kind: "malformed", message: "Health API returned an invalid response." };
  }
  return {
    kind: "valid",
    response: {
      status: payload.status as AppStatus,
      ...(payload.latency === undefined ? {} : { latency: payload.latency }),
      ...(statusCode === undefined ? {} : { statusCode }),
    },
  };
}

export function classifyHealthTransportError(caught: unknown) {
  return {
    kind: "transport-error" as const,
    message: caught instanceof Error && caught.message ? caught.message : "Unable to reach the health API.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidStatusCode(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599;
}
