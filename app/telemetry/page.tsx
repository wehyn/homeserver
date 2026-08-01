"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowLeft, Database, Gauge, HardDrive, Network, RefreshCw, Server,
  ShieldCheck, Thermometer, TriangleAlert, Wifi,
} from "lucide-react";
import type { DockerContainerTelemetry, TelemetryResponse } from "@/lib/telemetry-types";

export default function TelemetryPage() {
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as TelemetryResponse & { error?: string };
      if (!response.ok && !payload.schemaVersion) throw new Error(payload.error || "Unable to load host telemetry.");
      if (!payload.schemaVersion) throw new Error("The telemetry API returned invalid data.");
      setTelemetry(payload);
      setError("");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load host telemetry.");
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [refresh]);

  const host = telemetry?.host || null;
  return <main className="shell memory-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="content memory-content">
      <header className="topbar"><div className="breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>Telemetry</strong></div><div className="top-actions"><span className="last-sync" role="status" aria-live="polite">{error ? <TriangleAlert size={12} aria-hidden="true" /> : telemetry ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={12} className="spin" aria-hidden="true" />}{error ? "Telemetry unavailable" : telemetry ? `Updated ${formatTime(telemetry.updatedAt)}` : "Loading telemetry"}</span><button className="icon-button" onClick={() => void refresh()} title={error ? "Retry telemetry" : "Refresh telemetry"} aria-label={error ? "Retry telemetry" : "Refresh telemetry"}><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button><button className="avatar-button" aria-label="Open account menu">D</button></div></header>
      <div className="main-inner memory-inner telemetry-inner">
        <div className="memory-page-heading"><div><Link className="back-link" href="/"><ArrowLeft size={14} />Overview</Link><p className="eyebrow">System detail</p><h1>Telemetry</h1><p className="subheading">Host health and container resource usage, with unsupported capabilities called out clearly.</p></div><div className="memory-refresh-note" role="status" aria-live="polite" aria-busy={!telemetry && !error}>{error ? <TriangleAlert size={14} aria-hidden="true" /> : telemetry ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={14} className="spin" aria-hidden="true" />}{error ? "Unavailable" : telemetry ? "Live · 30 sec" : "Loading…"}</div></div>
        {!telemetry && !error && <TelemetryState icon={<RefreshCw className="spin" size={22} />} message="Reading host telemetry…" />}
        {error && <div className="memory-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><div><strong>Telemetry unavailable</strong><p>{error}</p><button className="small-primary" onClick={() => void refresh()}>Try again</button></div></div>}
        {telemetry?.warnings.length ? <div className="memory-warning"><TriangleAlert size={17} aria-hidden="true" /><div><strong>Some telemetry is incomplete</strong><p>{telemetry.warnings.join(" ")}</p></div></div> : null}
        {telemetry && <>
          <section className="telemetry-summary"><TelemetrySummary label="Host sensors" value={host?.temperatures.length ? `${host.temperatures.length}` : "—"} detail={host?.temperatures.length ? "temperature sources" : "Unavailable"} icon={<Thermometer size={16} />} tone="orange" /><TelemetrySummary label="Network links" value={host?.network.length ? `${host.network.length}` : "—"} detail={host?.network.length ? "readable interfaces" : "Unavailable"} icon={<Network size={16} />} tone="blue" /><TelemetrySummary label="Containers" value={telemetry.docker.available ? `${telemetry.containers.length}` : "—"} detail={telemetry.docker.available ? "discovered by agent" : "Docker unavailable"} icon={<Server size={16} />} tone="green" /><TelemetrySummary label="RAID arrays" value={host?.raid.length ? `${host.raid.length}` : "—"} detail={host?.raid.length ? "software arrays" : "None reported"} icon={<ShieldCheck size={16} />} tone="purple" /></section>
          <section className="telemetry-grid"><HostHardware host={host} /><DockerResources telemetry={telemetry} /></section>
        </>}
        <footer><Link href="/">← Back to overview</Link><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
  </main>;
}

function TelemetrySummary({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) {
  return <div className="memory-summary-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="memory-summary-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function HostHardware({ host }: { host: TelemetryResponse["host"] }) {
  if (!host) return <TelemetryCard title="Host hardware" icon={<Gauge size={18} />}><TelemetryState icon={<TriangleAlert size={20} />} message="Host sensors are unavailable." /></TelemetryCard>;
  return <TelemetryCard title="Host hardware" icon={<Gauge size={18} />}>
    <div className="telemetry-section"><h3><Thermometer size={14} />Temperatures</h3>{host.temperatures.length ? <div className="telemetry-list">{host.temperatures.map((temperature) => <div className="telemetry-row" key={temperature.id}><span>{temperature.label}</span><strong>{temperature.celsius.toFixed(1)}°C</strong></div>)}</div> : <CapabilityEmpty label="Temperature sensors unavailable" />}</div>
    <div className="telemetry-section"><h3><HardDrive size={14} />Disk state</h3>{host.disks.length ? <div className="telemetry-list">{host.disks.map((disk) => <div className="telemetry-row" key={disk.name}><span><strong>{disk.name}</strong><small>{disk.state || "state unavailable"}</small></span><em>{disk.smart === "unavailable" ? "SMART unavailable" : disk.smart}</em></div>)}</div> : <CapabilityEmpty label="Disk state unavailable" />}</div>
    <div className="telemetry-section"><h3><ShieldCheck size={14} />RAID and UPS</h3>{host.raid.length ? <div className="telemetry-list">{host.raid.map((array) => <div className="telemetry-row" key={array.name}><span><strong>{array.name}</strong><small>{array.detail}</small></span><em>{array.state}</em></div>)}</div> : <CapabilityEmpty label="No software RAID arrays reported" />}<div className="capability-note"><TriangleAlert size={13} />{host.ups.message}</div></div>
  </TelemetryCard>;
}

function DockerResources({ telemetry }: { telemetry: TelemetryResponse }) {
  if (!telemetry.docker.available) return <TelemetryCard title="Docker resources" icon={<Server size={18} />}><TelemetryState icon={<TriangleAlert size={20} />} message="Docker discovery is unavailable. Configure the read-only adapter to populate container resources." /></TelemetryCard>;
  return <TelemetryCard title="Docker resources" icon={<Server size={18} />}><p className="telemetry-card-note">Current container usage with a short local history. Resource values remain unavailable when Docker does not provide them.</p>{telemetry.containers.length ? <div className="docker-resource-list">{telemetry.containers.map((container) => <DockerResourceRow key={container.id} container={container} />)}</div> : <TelemetryState icon={<Database size={20} />} message="No containers were returned by the discovery agent." />}</TelemetryCard>;
}

function DockerResourceRow({ container }: { container: DockerContainerTelemetry }) {
  const resources = container.resources;
  return <article className="docker-resource-row"><div className="docker-resource-heading"><div><strong>{container.name}</strong><small>{container.compose.service || container.image || "Container"}</small></div><span className={`container-state container-${container.state}`}>{container.health !== "none" ? container.health : container.state}</span></div>{resources ? <div className="resource-metrics"><ResourceMetric label="CPU" value={resources.cpuPercent} suffix="%" tone="green" /><ResourceMetric label="Memory" value={resources.memoryPercent} suffix="%" tone="blue" /><ResourceMetric label="PIDs" value={resources.pids} suffix="" tone="purple" /></div> : <CapabilityEmpty label="Resource usage unavailable" />}{container.history.length > 1 && <div className="sparkline-row"><span>CPU history</span><Sparkline values={container.history.map((point) => point.cpuPercent)} tone="green" /><span>{formatTime(container.history[container.history.length - 1].observedAt)}</span></div>}</article>;
}

function ResourceMetric({ label, value, suffix, tone }: { label: string; value: number | null; suffix: string; tone: string }) {
  return <div className="resource-metric"><span>{label}</span><strong>{value === null ? "—" : `${formatNumber(value)}${suffix}`}</strong><div className="resource-track"><i className={tone} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} /></div></div>;
}

function Sparkline({ values, tone }: { values: Array<number | null>; tone: string }) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length < 2) return null;
  const max = Math.max(1, ...usable);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${value === null ? 30 : 32 - Math.min(30, (value / max) * 30)}`).join(" ");
  return <svg className={`telemetry-sparkline ${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Recent CPU resource history"><polyline points={points} fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}

function TelemetryCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="telemetry-card"><div className="card-heading"><div><h2>{title}</h2></div><span className="process-heading-icon telemetry-heading-icon">{icon}</span></div>{children}</section>;
}

function CapabilityEmpty({ label }: { label: string }) { return <div className="capability-empty"><span>{label}</span></div>; }
function TelemetryState({ icon, message }: { icon: React.ReactNode; message: string }) { return <div className="process-state telemetry-state" role="status" aria-live="polite">{icon}<span>{message}</span></div>; }
function formatNumber(value: number) { return value >= 10 ? value.toFixed(1) : value.toFixed(2); }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
