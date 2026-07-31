"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpDown, Database, RefreshCw, TriangleAlert } from "lucide-react";
import type { MemoryProcess, MemorySnapshot } from "@/lib/types";

type SortKey = "name" | "command" | "pid" | "user" | "rssBytes" | "memoryPercent";

const sortLabels: Record<SortKey, string> = {
  name: "Process",
  command: "Command",
  pid: "PID",
  user: "User",
  rssBytes: "RSS",
  memoryPercent: "RAM %",
};

export default function MemoryPage() {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rssBytes");
  const [descending, setDescending] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/memory/processes", { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({})) as MemorySnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load memory details.");
      setSnapshot(data);
      setError("");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load memory details.");
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
      setDescending(nextKey === "rssBytes" || nextKey === "memoryPercent");
    }
  }

  return <main className="shell memory-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="content memory-content">
      <header className="topbar"><div className="breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>Memory</strong></div><div className="top-actions"><span className="last-sync"><span className="sync-dot" />{snapshot ? `Updated ${formatTime(snapshot.updatedAt)}` : "Loading memory"}</span><button className="icon-button" onClick={() => void refresh()} title="Refresh memory details" aria-label="Refresh memory details"><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button><button className="avatar-button">D</button></div></header>
      <div className="main-inner memory-inner">
        <div className="memory-page-heading"><div><Link className="back-link" href="/"><ArrowLeft size={14} />Overview</Link><p className="eyebrow">System detail</p><h1>Memory</h1><p className="subheading">Host processes using RAM on this device.</p></div><div className="memory-refresh-note"><span className="sync-dot" />Live · 5 sec</div></div>
        {snapshot && <section className="memory-summary"><MemorySummary label="Used" value={formatBytes(snapshot.usedBytes)} detail={`${snapshot.usedPercent}% of total`} tone="blue" /><MemorySummary label="Available" value={formatBytes(snapshot.availableBytes)} detail="Ready for workloads" tone="green" /><MemorySummary label="Total" value={formatBytes(snapshot.totalBytes)} detail={`${snapshot.processes.length} readable processes`} tone="purple" /></section>}
        {snapshot?.partial && <div className="memory-warning"><TriangleAlert size={17} /><div><strong>Some process details are incomplete</strong><p>{snapshot.warnings.join(" ")}</p></div></div>}
        {error && <div className="memory-error"><TriangleAlert size={17} /><div><strong>Memory details unavailable</strong><p>{error}</p><button className="small-primary" onClick={() => void refresh()}>Try again</button></div></div>}
        <section className="process-card"><div className="card-heading"><div><div className="section-title-row"><h2>Processes</h2>{snapshot && <span className="count-pill">{snapshot.processes.length}</span>}</div><p>Resident set size is the physical RAM currently held by each process.</p></div><Database size={18} className="process-heading-icon" /></div>{!snapshot && !error ? <div className="process-state"><RefreshCw size={20} className="spin" /><span>Reading host processes…</span></div> : error && !snapshot ? <div className="process-state"><TriangleAlert size={20} /><span>Start the metrics agent to view processes.</span></div> : processes.length ? <div className="process-table-wrap"><table className="process-table"><thead><tr>{(Object.keys(sortLabels) as SortKey[]).map((key) => <th key={key} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}><button onClick={() => changeSort(key)}>{sortLabels[key]}<ArrowUpDown size={13} /></button></th>)}</tr></thead><tbody>{processes.map((process) => <tr key={process.pid}><td><strong>{process.name}</strong></td><td className="process-command" title={process.command}>{process.command}</td><td className="mono-cell">{process.pid}</td><td>{process.user}</td><td className="value-cell">{formatBytes(process.rssBytes)}</td><td className="value-cell">{formatPercent(process.memoryPercent)}</td></tr>)}</tbody></table></div> : <div className="process-state"><Database size={20} /><span>No readable processes were returned.</span></div>}</section>
        <footer><Link href="/">← Back to overview</Link><span className="footer-spacer" /><span className="connection"><span className="sync-dot" />Connected locally</span></footer>
      </div>
    </section>
  </main>;
}

function MemorySummary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className="memory-summary-card"><span className={`stat-icon ${tone}`}><Database size={16} /></span><span className="memory-summary-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function compareProcesses(left: MemoryProcess, right: MemoryProcess, key: SortKey, descending: boolean) {
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
