"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpDown, Cpu, RefreshCw, TriangleAlert } from "lucide-react";
import type { CpuProcess, ProcessorSnapshot } from "@/lib/types";

type SortKey = "name" | "command" | "pid" | "user" | "cpuPercent" | "rssBytes" | "memoryPercent";

const sortLabels: Record<SortKey, string> = {
  name: "Process",
  command: "Command",
  pid: "PID",
  user: "User",
  cpuPercent: "CPU %",
  rssBytes: "RSS",
  memoryPercent: "RAM %",
};

export default function ProcessorPage() {
  const [snapshot, setSnapshot] = useState<ProcessorSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [descending, setDescending] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/processor/processes", { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({})) as ProcessorSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load processor details.");
      setSnapshot(data);
      setError("");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load processor details.");
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [refresh]);

  const processes = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.processes].sort((left, right) => compareProcesses(left, right, sortKey, descending));
  }, [snapshot, sortKey, descending]);

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) setDescending((current) => !current);
    else {
      setSortKey(nextKey);
      setDescending(nextKey === "cpuPercent" || nextKey === "rssBytes" || nextKey === "memoryPercent");
    }
  }

  return <main className="shell memory-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="content memory-content">
      <header className="topbar"><div className="breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>Processor</strong></div><div className="top-actions"><span className="last-sync" role="status" aria-live="polite">{error ? <TriangleAlert size={12} aria-hidden="true" /> : snapshot ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={12} className="spin" aria-hidden="true" />}{error ? "Processor unavailable" : snapshot ? `Updated ${formatTime(snapshot.updatedAt)}` : "Loading processor"}</span><button className="icon-button" onClick={() => void refresh()} title={error ? "Retry processor details" : "Refresh processor details"} aria-label={error ? "Retry processor details" : "Refresh processor details"}><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button><button className="avatar-button">D</button></div></header>
      <div className="main-inner memory-inner">
        <div className="memory-page-heading"><div><Link className="back-link" href="/"><ArrowLeft size={14} />Overview</Link><p className="eyebrow">System detail</p><h1>Processor</h1><p className="subheading">Host processes using CPU on this device.</p></div><div className="memory-refresh-note" role="status" aria-live="polite" aria-busy={!snapshot && !error}>{error ? <TriangleAlert size={14} aria-hidden="true" /> : snapshot ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={14} className="spin" aria-hidden="true" />}{error ? "Unavailable" : snapshot ? "Live · 5 sec" : "Loading…"}</div></div>
        {snapshot && <section className="memory-summary"><ProcessorSummary label="CPU usage" value={`${formatPercent(snapshot.cpuPercent)}`} detail={`${snapshot.cpuCores} logical cores`} tone="green" icon={<Cpu size={16} />} /><ProcessorSummary label="Load average" value={snapshot.loadAverage.one.toFixed(2)} detail={`5m ${snapshot.loadAverage.five.toFixed(2)} · 15m ${snapshot.loadAverage.fifteen.toFixed(2)}`} tone="purple" icon={<Cpu size={16} />} /><ProcessorSummary label="Processes" value={`${snapshot.processes.length}`} detail="All readable processes" tone="blue" icon={<Cpu size={16} />} /></section>}
        {snapshot?.sampling && <div className="memory-info"><RefreshCw size={17} className="spin" /><div><strong>Sampling CPU usage</strong><p>The first reading establishes a baseline; the next refresh will be more representative.</p></div></div>}
        {snapshot?.partial && <div className="memory-warning"><TriangleAlert size={17} /><div><strong>Some process details are incomplete</strong><p>{snapshot.warnings.join(" ")}</p></div></div>}
        {error && <div className="memory-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><div><strong>Processor details unavailable</strong><p>{error}</p><button className="small-primary" onClick={() => void refresh()}>Try again</button></div></div>}
        <section className="process-card"><div className="card-heading"><div><div className="section-title-row"><h2>Processes</h2>{snapshot && <span className="count-pill">{snapshot.processes.length}</span>}</div><p>CPU percentage is each process’s share of total system CPU.</p></div><Cpu size={18} className="process-heading-icon" /></div>{!snapshot && !error ? <div className="process-state" role="status" aria-live="polite"><RefreshCw size={20} className="spin" aria-hidden="true" /><span>Reading host processes…</span></div> : error && !snapshot ? <div className="process-state"><TriangleAlert size={20} aria-hidden="true" /><span>Metrics agent unavailable. Use Try again to retry.</span></div> : processes.length ? <div className="process-table-wrap"><table className="process-table processor-table"><thead><tr>{(Object.keys(sortLabels) as SortKey[]).map((key) => <th key={key} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}><button onClick={() => changeSort(key)}>{sortLabels[key]}<ArrowUpDown size={13} /></button></th>)}</tr></thead><tbody>{processes.map((process) => <tr key={process.pid}><td><strong>{process.name}</strong></td><td className="process-command" title={process.command}>{process.command}</td><td className="mono-cell">{process.pid}</td><td>{process.user}</td><td className="value-cell">{formatPercent(process.cpuPercent)}</td><td className="value-cell">{formatBytes(process.rssBytes)}</td><td className="value-cell">{formatPercent(process.memoryPercent)}</td></tr>)}</tbody></table></div> : <div className="process-state"><Cpu size={20} aria-hidden="true" /><span>No readable processes were returned.</span></div>}</section>
        <footer><Link href="/">← Back to overview</Link><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
  </main>;
}

function ProcessorSummary({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return <div className="memory-summary-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="memory-summary-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function compareProcesses(left: CpuProcess, right: CpuProcess, key: SortKey, descending: boolean) {
  const leftValue = left[key];
  const rightValue = right[key];
  const comparison = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue) : Number(leftValue) - Number(rightValue);
  return descending ? -comparison : comparison;
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPercent(value: number) {
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
