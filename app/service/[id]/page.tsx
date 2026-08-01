"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, CheckCircle2, Clock3, Container, Database, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import type { ManagedApp } from "@/lib/types";
import type { ServiceOperations } from "@/lib/service-operations-types";

export default function ServicePage() {
  const params = useParams<{ id: string }>();
  const serviceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [app, setApp] = useState<ManagedApp | null>(null);
  const [operations, setOperations] = useState<ServiceOperations | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!serviceId) return;
    setRefreshing(true);
    try {
      const [appsResponse, operationsResponse] = await Promise.all([
        fetch("/api/apps", { cache: "no-store" }),
        fetch(`/api/service-operations?serviceId=${encodeURIComponent(serviceId)}`, { cache: "no-store" }),
      ]);
      const appsData = await appsResponse.json().catch(() => ({})) as { apps?: ManagedApp[] };
      const operationsData = await operationsResponse.json().catch(() => ({})) as ServiceOperations & { error?: string };
      if (!operationsResponse.ok) throw new Error(operationsData.error || "Unable to load service operations.");
      setApp(appsData.apps?.find((candidate) => candidate.id === serviceId) || null);
      setOperations(operationsData);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load service operations.");
    } finally {
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return <main className="shell memory-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="content memory-content">
      <header className="topbar"><div className="breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>{app?.name || serviceId || "Service"}</strong></div><div className="top-actions"><span className="last-sync" role="status" aria-live="polite">{error ? <TriangleAlert size={12} aria-hidden="true" /> : operations ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={12} className="spin" aria-hidden="true" />}{error ? "Operations unavailable" : operations ? `Updated ${formatTime(operations.statusHistory[0]?.observedAt)}` : "Loading operations"}</span><button className="icon-button" onClick={() => void refresh()} title="Refresh service operations" aria-label="Refresh service operations"><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button><button className="avatar-button" aria-label="Open account menu">D</button></div></header>
      <div className="main-inner memory-inner service-inner">
        <div className="memory-page-heading"><div><Link className="back-link" href="/"><ArrowLeft size={14} />Overview</Link><p className="eyebrow">Service operations</p><h1>{app?.name || serviceId || "Service"}</h1><p className="subheading">Status history, availability, dependencies, and operational metadata.</p></div><div className="memory-refresh-note" role="status" aria-live="polite" aria-busy={!operations && !error}>{error ? <TriangleAlert size={14} aria-hidden="true" /> : operations ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={14} className="spin" aria-hidden="true" />}{error ? "Unavailable" : operations ? "Live · 30 sec" : "Loading…"}</div></div>
        {error && <div className="memory-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><div><strong>Service operations unavailable</strong><p>{error}</p><button className="small-primary" onClick={() => void refresh()}>Try again</button></div></div>}
        {!operations && !error && <div className="process-state" role="status" aria-live="polite"><RefreshCw size={20} className="spin" /><span>Loading service operations…</span></div>}
        {operations && <>
          <section className="telemetry-summary"><OperationSummary label="Current status" value={statusLabel(operations.availability.currentStatus)} detail={`${operations.statusHistory.length} recorded state events`} icon={statusIcon(operations.availability.currentStatus)} tone={statusTone(operations.availability.currentStatus)} /><OperationSummary label="Availability" value={`${operations.availability.availabilityPercent.toFixed(2)}%`} detail={`${operations.availability.coveragePercent.toFixed(1)}% window covered`} icon={<CheckCircle2 size={16} />} tone="green" /><OperationSummary label="Average latency" value={operations.latency.averageMs === undefined ? "—" : `${operations.latency.averageMs} ms`} detail={operations.latency.p95Ms === undefined ? "No latency readings" : `P95 ${operations.latency.p95Ms} ms`} icon={<Clock3 size={16} />} tone="blue" /><OperationSummary label="Uptime" value={`${operations.availability.uptimePercent.toFixed(2)}%`} detail={`${formatDuration(operations.availability.onlineSeconds)} online`} icon={<Activity size={16} />} tone="purple" /></section>
          <section className="service-detail-grid"><section className="process-card"><div className="card-heading"><div><h2>Status history</h2><p>Repeated identical polls are compacted into five-minute heartbeats.</p></div><Activity size={18} className="process-heading-icon" /></div>{operations.statusHistory.length ? <div className="service-history">{operations.statusHistory.map((event) => <div className="service-history-row" key={event.id}><span className={`service-status-dot status-${event.status}`} /><div><strong>{statusLabel(event.status)}</strong><small>{formatTime(event.observedAt)} · {event.source}</small></div><span className="service-history-latency">{event.latencyMs === undefined ? "—" : `${event.latencyMs} ms`}</span></div>)}</div> : <div className="process-state"><Activity size={20} /><span>No status observations yet. Refresh health from the overview.</span></div>}</section><div className="service-side-stack"><ServiceMetadata title="Dependencies" icon={<ShieldCheck size={17} />}>{operations.dependencies.length ? <div className="service-meta-list">{operations.dependencies.map((dependency) => <div key={dependency.dependsOnServiceId}><strong>{dependency.dependsOnServiceId}</strong><small>{dependency.label || "Dependency"} · {dependency.critical ? "critical" : "optional"}</small></div>)}</div> : <p className="service-empty">No dependencies recorded.</p>}</ServiceMetadata><ServiceMetadata title="Container state" icon={<Container size={17} />}>{operations.containerState ? <div className="service-meta-list"><div><strong>{operations.containerState.state}</strong><small>{operations.containerState.containerName || operations.containerState.containerId || "Container identity unavailable"}</small></div><div><strong>{operations.containerState.healthStatus}</strong><small>{operations.containerState.image || "Image unavailable"}</small></div></div> : <p className="service-empty">No container state recorded.</p>}</ServiceMetadata><ServiceMetadata title="Last backup" icon={<Database size={17} />}>{operations.backup ? <div className="service-meta-list"><div><strong>{operations.backup.status}</strong><small>{operations.backup.provider || "Provider not recorded"}</small></div><div><strong>{operations.backup.lastBackupAt ? formatTime(operations.backup.lastBackupAt) : "—"}</strong><small>{operations.backup.message || "Last backup time"}</small></div></div> : <p className="service-empty">No backup metadata recorded.</p>}</ServiceMetadata></div></section>
        </>}
        <footer><Link href="/">← Back to overview</Link><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
  </main>;
}

function OperationSummary({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) { return <div className="memory-summary-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="memory-summary-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function ServiceMetadata({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="activity-card service-metadata"><div className="card-heading"><h3>{title}</h3><span className="process-heading-icon">{icon}</span></div>{children}</section>; }
function statusLabel(status: string) { return status === "online" ? "Online" : status === "degraded" ? "Degraded" : status === "offline" ? "Offline" : "Not checked"; }
function statusIcon(status: string) { return status === "online" ? <CheckCircle2 size={16} /> : status === "offline" ? <XCircle size={16} /> : <TriangleAlert size={16} />; }
function statusTone(status: string) { return status === "online" ? "green" : status === "offline" ? "purple" : "orange"; }
function formatDuration(seconds: number) { if (!seconds) return "0s"; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function formatTime(value: string | undefined) { if (!value) return "recently"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
