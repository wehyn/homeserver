import { NextResponse } from "next/server";
import {
  getServiceOperations,
  recordBackupMetadata,
  recordContainerState,
  recordServiceObservation,
  setServiceDependencies,
} from "@/lib/service-operations";
import type {
  BackupMetadataInput,
  ContainerStateInput,
  ServiceDependencyInput,
  ServiceObservationInput,
} from "@/lib/service-operations-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId") || "";
  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  try {
    return NextResponse.json(getServiceOperations(serviceId, {
      historyLimit: parseQueryInteger(url.searchParams.get("historyLimit")),
      windowHours: parseQueryInteger(url.searchParams.get("windowHours")),
    }));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const body = asRecord(payload);
  if (!body) return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  const action = typeof body.action === "string" ? body.action : "observe";
  try {
    if (action === "observe") return NextResponse.json({ result: recordServiceObservation(parseObservation(body)) });
    if (action === "dependencies") {
      const serviceId = requireString(body.serviceId, "serviceId");
      if (!Array.isArray(body.dependencies)) throw new Error("dependencies must be an array.");
      return NextResponse.json({ dependencies: setServiceDependencies(serviceId, body.dependencies.map((value) => parseDependency(value, serviceId))) });
    }
    if (action === "container") return NextResponse.json({ containerState: recordContainerState(parseContainerState(body)) });
    if (action === "backup") return NextResponse.json({ backup: recordBackupMetadata(parseBackupMetadata(body)) });
    throw new Error("action must be observe, dependencies, container, or backup.");
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function parseObservation(body: Record<string, unknown>): ServiceObservationInput {
  const status = requireString(body.status, "status");
  return {
    serviceId: requireString(body.serviceId, "serviceId"),
    status: status as ServiceObservationInput["status"],
    latencyMs: optionalNumber(body.latencyMs),
    observedAt: optionalString(body.observedAt),
    source: optionalString(body.source),
  };
}

function parseDependency(value: unknown, serviceId: string): ServiceDependencyInput {
  const dependency = asRecord(value);
  if (!dependency) throw new Error("Each dependency must be an object.");
  if (dependency.critical !== undefined && typeof dependency.critical !== "boolean") {
    throw new Error("critical must be a boolean.");
  }
  return {
    serviceId,
    dependsOnServiceId: requireString(dependency.dependsOnServiceId, "dependsOnServiceId"),
    label: optionalString(dependency.label),
    critical: dependency.critical === undefined ? true : Boolean(dependency.critical),
  };
}

function parseContainerState(body: Record<string, unknown>): ContainerStateInput {
  return {
    serviceId: requireString(body.serviceId, "serviceId"),
    state: requireString(body.state, "state") as ContainerStateInput["state"],
    healthStatus: optionalString(body.healthStatus) as ContainerStateInput["healthStatus"],
    containerId: optionalString(body.containerId),
    containerName: optionalString(body.containerName),
    image: optionalString(body.image),
    restartCount: optionalNumber(body.restartCount),
    startedAt: optionalString(body.startedAt),
    finishedAt: optionalString(body.finishedAt),
    observedAt: optionalString(body.observedAt),
    source: optionalString(body.source),
  };
}

function parseBackupMetadata(body: Record<string, unknown>): BackupMetadataInput {
  return {
    serviceId: requireString(body.serviceId, "serviceId"),
    status: requireString(body.status, "status") as BackupMetadataInput["status"],
    lastBackupAt: optionalString(body.lastBackupAt),
    provider: optionalString(body.provider),
    reference: optionalString(body.reference),
    message: optionalString(body.message),
    observedAt: optionalString(body.observedAt),
  };
}

function parseQueryInteger(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Query limits must be integers.");
  return parsed;
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Numeric fields must be finite numbers.");
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update service operations.";
}
