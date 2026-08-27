"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { HistoricalMetric } from "@/lib/types";

type MetricKey = "cpu" | "memory" | "storage";
type MetricHistoryResponse = { minutes: number; points: HistoricalMetric[] };

const ranges = [
  { minutes: 5, label: "5m" },
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
];
const series: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: "cpu", label: "CPU", color: "#a8cf8d" },
  { key: "memory", label: "Memory", color: "#9aa6b4" },
  { key: "storage", label: "Storage", color: "#ddb37e" },
];

export default function MetricsHistoryChart({ metric }: { metric: "cpu" | "memory" }) {
  const [minutes, setMinutes] = useState(5);
  const [points, setPoints] = useState<HistoricalMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback((signal?: AbortSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    setLoading(true);
    fetch(`/api/metrics/history?minutes=${minutes}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as MetricHistoryResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load metric history.");
        setPoints(Array.isArray(data.points) ? data.points : []);
        setError("");
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load metric history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        signal?.removeEventListener("abort", abort);
      });
    return controller;
  }, [minutes]);

  useEffect(() => {
    const request = loadHistory();
    const interval = window.setInterval(() => {
      request.abort();
      loadHistory();
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      request.abort();
    };
  }, [loadHistory]);

  const chart = useMemo(() => buildChart(points), [points]);
  const visibleSeries = series.filter((item) => item.key === metric);

  return <section className="metrics-history-card" aria-label="Historical system metrics" aria-busy={loading}>
    <div className="metrics-history-header">
      <div><p className="eyebrow">System history</p><h2>Resource usage</h2></div>
      <div className="metrics-history-controls" role="group" aria-label="Metric history range">
        {ranges.map((range) => <button key={range.minutes} type="button" className={minutes === range.minutes ? "active" : ""} onClick={() => setMinutes(range.minutes)} aria-pressed={minutes === range.minutes}>{range.label}</button>)}
      </div>
    </div>
    <div className="metrics-history-legend">{visibleSeries.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    {error ? <div className="metrics-history-state" role="alert"><TriangleAlert size={18} /><span>{error}</span></div> : !points.length && !loading ? <div className="metrics-history-state"><span>Collecting history…</span><small>Snapshots appear after the first minute.</small></div> : <div className="metrics-chart-wrap">
      <svg className="metrics-chart" viewBox="0 0 800 220" role="img" aria-label={`${metric === "cpu" ? "CPU" : "Memory"} usage over the last ${formatRange(minutes)}`}>
        {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1="0" x2="800" y1={200 - value * 1.8} y2={200 - value * 1.8} className="metrics-chart-grid" /><text x="0" y={196 - value * 1.8} className="metrics-chart-label">{value}%</text></g>)}
        {visibleSeries.map((item) => <polyline key={item.key} points={chart[item.key]} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      {loading && <span className="metrics-history-loading"><RefreshCw size={14} className="spin" /> Updating</span>}
    </div>}
    <div className="metrics-history-footer"><span>{points.length ? `${points.length} samples` : "No samples yet"}</span><span>Stored locally · 30-day retention</span></div>
  </section>;
}

function formatRange(minutes: number) {
  return `${minutes} minutes`;
}

function buildChart(points: HistoricalMetric[]) {
  const values = Object.fromEntries(series.map(({ key }) => [key, toPolyline(points, key)])) as Record<MetricKey, string>;
  return values;
}

function toPolyline(points: HistoricalMetric[], key: MetricKey) {
  if (!points.length) return "";
  const denominator = Math.max(1, points.length - 1);
  const values = points.map((point, index) => `${(index / denominator) * 800},${200 - Math.min(100, Math.max(0, point[key])) * 1.8}`);
  return values.length === 1 ? `0,${values[0].split(",")[1]} 800,${values[0].split(",")[1]}` : values.join(" ");
}
