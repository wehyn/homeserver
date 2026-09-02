"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, Cpu, Database, RefreshCw, TriangleAlert, X } from "lucide-react";
import { getNextProcessSortDirection, getProcessSortButtonLabel, getProcessTableCaption } from "@/lib/system-details-accessibility";
import type { CpuProcess, MemoryProcess, MemorySnapshot, ProcessorSnapshot } from "@/lib/types";
import MetricsHistoryChart from "@/app/metrics-history-chart";
import { getFocusableElements } from "@/app/modal-focus.tsx";

export type SystemDetailKind = "processor" | "memory";
type SortKey = "name" | "command" | "pid" | "user" | "cpuPercent" | "rssBytes" | "memoryPercent";

const processorSortLabels: Partial<Record<SortKey, string>> = {
  name: "Process",
  command: "Command",
  pid: "PID",
  user: "User",
  cpuPercent: "CPU %",
  rssBytes: "RSS",
  memoryPercent: "RAM %",
};

const memorySortLabels: Partial<Record<SortKey, string>> = {
  name: "Process",
  command: "Command",
  pid: "PID",
  user: "User",
  rssBytes: "RSS",
  memoryPercent: "RAM %",
};

const motionTransition = { duration: 0.2, ease: "easeOut" as const };

export default function SystemDetailsModal({ kind, onClose }: { kind: SystemDetailKind; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | ProcessorSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(kind === "processor" ? "cpuPercent" : "rssBytes");
  const [descending, setDescending] = useState(true);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const previousBodyOverflowRef = useRef("");
  const title = kind === "processor" ? "Processor" : "Memory";
  const sortLabels = kind === "processor" ? processorSortLabels : memorySortLabels;

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const endpoint = kind === "processor" ? "/api/processor/processes" : "/api/memory/processes";
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({})) as (MemorySnapshot | ProcessorSnapshot) & { error?: string };
      if (!response.ok) throw new Error(data.error || `Unable to load ${title.toLowerCase()} details.`);
      setSnapshot(data);
      setError("");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : `Unable to load ${title.toLowerCase()} details.`);
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, [kind, title]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
      document.body.style.overflow = previousBodyOverflowRef.current;
    };
  }, [refresh]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusableElements = getFocusableElements(panelRef.current).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!focusableElements.length) {
        event.preventDefault();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (document.activeElement !== first && document.activeElement !== last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const processes = useMemo(() => {
    if (!snapshot) return [] as Array<CpuProcess | MemoryProcess>;
    if (kind === "processor") {
      return [...(snapshot as ProcessorSnapshot).processes].sort((left, right) => compareProcesses(left, right, sortKey, descending));
    }
    return [...(snapshot as MemorySnapshot).processes].sort((left, right) => compareProcesses(left, right, sortKey, descending));
  }, [snapshot, kind, sortKey, descending]);

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) setDescending((current) => !current);
    else {
      setSortKey(nextKey);
      setDescending(nextKey === "cpuPercent" || nextKey === "rssBytes" || nextKey === "memoryPercent");
    }
  }

  const processorSnapshot = kind === "processor" && snapshot ? snapshot as ProcessorSnapshot : null;
  const memorySnapshot = kind === "memory" && snapshot ? snapshot as MemorySnapshot : null;

  return <motion.div className="panel-backdrop system-details-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition} onClick={onClose}>
    <section ref={panelRef} className="settings-panel system-details-modal" role="dialog" aria-modal="true" aria-labelledby="system-details-title" aria-busy={!snapshot && !error} onClick={(event) => event.stopPropagation()}>
      <div className="panel-header system-details-header">
        <div>
          <p className="eyebrow">System detail</p>
          <h2 id="system-details-title">{title}</h2>
          <p className="system-details-description">Host processes using {kind === "processor" ? "CPU" : "RAM"} on this device.</p>
        </div>
        <div className="system-details-actions">
          <span className="system-details-status" role="status" aria-live="polite">
            {error ? <TriangleAlert size={13} aria-hidden="true" /> : snapshot ? <span className="sync-dot" aria-hidden="true" /> : <RefreshCw size={13} className="spin" aria-hidden="true" />}
            {error ? "Unavailable" : snapshot ? `Updated ${formatTime(snapshot.updatedAt)}` : "Loading…"}
          </span>
          <button type="button" className="icon-button system-details-refresh" onClick={() => void refresh()} title={error ? `Retry ${title.toLowerCase()} details` : `Refresh ${title.toLowerCase()} details`} aria-label={error ? `Retry ${title.toLowerCase()} details` : `Refresh ${title.toLowerCase()} details`}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
          <button type="button" ref={closeButtonRef} className="close-button" onClick={onClose} aria-label={`Close ${title.toLowerCase()} details`}><X size={18} aria-hidden="true" /></button>
        </div>
      </div>

      {processorSnapshot && <section className="memory-summary system-details-summary">
        <SystemSummary label="CPU usage" value={formatPercent(processorSnapshot.cpuPercent)} detail={`${processorSnapshot.cpuCores} logical cores`} tone="green" icon={<Cpu size={16} />} />
        <SystemSummary label="Load average" value={processorSnapshot.loadAverage.one.toFixed(2)} detail={`5m ${processorSnapshot.loadAverage.five.toFixed(2)} · 15m ${processorSnapshot.loadAverage.fifteen.toFixed(2)}`} tone="purple" icon={<Cpu size={16} />} />
        <SystemSummary label="Processes" value={`${processorSnapshot.processes.length}`} detail="All readable processes" tone="blue" icon={<Cpu size={16} />} />
      </section>}
      {memorySnapshot && <section className="memory-summary system-details-summary">
        <SystemSummary label="Used" value={formatBytes(memorySnapshot.usedBytes)} detail={`${memorySnapshot.usedPercent}% of total`} tone="blue" icon={<Database size={16} />} />
        <SystemSummary label="Available" value={formatBytes(memorySnapshot.availableBytes, 2)} detail="Ready for workloads" tone="green" icon={<Database size={16} />} />
        <SystemSummary label="Total" value={formatBytes(memorySnapshot.totalBytes, 2)} detail={`${memorySnapshot.processes.length} readable processes`} tone="purple" icon={<Database size={16} />} />
      </section>}

      {processorSnapshot?.sampling && <SystemNotice tone="info" icon={<RefreshCw size={16} className="spin" />} title="Sampling CPU usage">The first reading establishes a baseline; the next refresh will be more representative.</SystemNotice>}
      {(processorSnapshot?.partial || memorySnapshot?.partial) && <SystemNotice tone="warning" icon={<TriangleAlert size={16} />} title="Some process details are incomplete">{(processorSnapshot || memorySnapshot)?.warnings.join(" ")}</SystemNotice>}
      {error && <div className="memory-error system-details-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><div><strong>{title} details unavailable</strong><p>{error}</p><button type="button" className="small-primary" onClick={() => void refresh()}>Try again</button></div></div>}
      <MetricsHistoryChart metric={kind === "processor" ? "cpu" : "memory"} />

      <section className="process-card system-details-process-card">
        <div className="card-heading"><div><div className="section-title-row"><h3>Processes</h3>{snapshot && <span className="count-pill">{snapshot.processes.length}</span>}</div><p>{kind === "processor" ? "CPU percentage is each process’s share of total system CPU." : "Resident set size is the physical RAM currently held by each process."}</p></div>{kind === "processor" ? <Cpu size={18} className="process-heading-icon" /> : <Database size={18} className="process-heading-icon" />}</div>
        {!snapshot && !error ? <div className="process-state" role="status" aria-live="polite"><RefreshCw size={20} className="spin" aria-hidden="true" /><span>Reading host processes…</span></div> : error && !snapshot ? <div className="process-state"><TriangleAlert size={20} aria-hidden="true" /><span>Metrics agent unavailable. Use Try again to retry.</span></div> : processes.length ? <ProcessTable kind={kind} title={title} processes={processes} sortKey={sortKey} descending={descending} sortLabels={sortLabels} changeSort={changeSort} /> : <div className="process-state"><Database size={20} aria-hidden="true" /><span>No readable processes were returned.</span></div>}
      </section>
      <div className="system-details-footer"><span><span className="sync-dot" />Live · refreshes every 5 sec</span><span>Connected locally</span></div>
    </section>
  </motion.div>;
}

function ProcessTable({
  kind,
  title,
  processes,
  sortKey,
  descending,
  sortLabels,
  changeSort,
}: {
  kind: SystemDetailKind;
  title: string;
  processes: Array<CpuProcess | MemoryProcess>;
  sortKey: SortKey;
  descending: boolean;
  sortLabels: Partial<Record<SortKey, string>>;
  changeSort: (nextKey: SortKey) => void;
}) {
  return <div className="process-table-wrap"><table className={`process-table${kind === "processor" ? " processor-table" : ""}`}>
    <caption className="visually-hidden">{getProcessTableCaption(title, sortLabels[sortKey] ?? sortKey, descending ? "descending" : "ascending")}</caption>
    <thead><tr>{(Object.keys(sortLabels) as SortKey[]).map((key) => {
      const field = sortLabels[key] ?? key;
      const currentDirection = sortKey === key ? descending ? "descending" : "ascending" : null;
      const nextDirection = getNextProcessSortDirection({ label: field, numeric: key === "cpuPercent" || key === "rssBytes" || key === "memoryPercent" }, sortKey === key, descending);
      return <th key={key} aria-sort={sortKey === key ? (descending ? "descending" : "ascending") : "none"}><button type="button" onClick={() => changeSort(key)} aria-label={getProcessSortButtonLabel(field, currentDirection, nextDirection)}>{field}<ArrowUpDown size={13} aria-hidden="true" /></button></th>;
    })}</tr></thead>
    <tbody>{processes.map((process) => <tr key={process.pid}><td><strong>{process.name}</strong></td><td className="process-command" title={process.command}>{process.command}</td><td className="mono-cell">{process.pid}</td><td>{process.user}</td>{kind === "processor" && <td className="value-cell">{formatPercent((process as CpuProcess).cpuPercent)}</td>}<td className="value-cell">{formatBytes(process.rssBytes)}</td><td className="value-cell">{formatPercent(process.memoryPercent)}</td></tr>)}</tbody>
  </table></div>;
}

function SystemSummary({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return <div className="memory-summary-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="memory-summary-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function SystemNotice({ tone, icon, title, children }: { tone: "info" | "warning"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className={`memory-${tone} system-details-notice`}>{icon}<div><strong>{title}</strong><p>{children}</p></div></div>;
}

function compareProcesses(left: CpuProcess | MemoryProcess, right: CpuProcess | MemoryProcess, key: SortKey, descending: boolean) {
  const leftValue = (left as unknown as Record<string, string | number>)[key];
  const rightValue = (right as unknown as Record<string, string | number>)[key];
  const comparison = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue) : Number(leftValue) - Number(rightValue);
  return descending ? -comparison : comparison;
}

function formatBytes(bytes: number, decimals?: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formattedValue = decimals === undefined
    ? value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)
    : value.toFixed(decimals);
  return `${formattedValue} ${units[unitIndex]}`;
}

function formatPercent(value: number) {
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
