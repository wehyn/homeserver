"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { HistoricalMetric } from "@/lib/types";
import { buildMetricsChart, CHART_HEIGHT, CHART_PLOT, CHART_WIDTH, formatChartTime, type ChartMetric, type MetricsChartData } from "@/lib/metrics-chart";

type MetricHistoryResponse = { minutes: number; points: HistoricalMetric[] };

const ranges = [
  { minutes: 5, label: "5m" },
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
];
const chartColors: Record<ChartMetric, string> = { cpu: "#b9e394", memory: "#b9c7d8" };
const metricLabels: Record<ChartMetric, string> = { cpu: "CPU", memory: "Memory" };

export default function MetricsHistoryChart({ metric }: { metric: ChartMetric }) {
  const [minutes, setMinutes] = useState(5);
  const [points, setPoints] = useState<HistoricalMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestRef.current = controller;
    setLoading(true);

    void fetchMetricHistory(minutes, controller.signal)
      .then((nextPoints) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setPoints(nextPoints);
        setError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setError(caught instanceof Error ? caught.message : "Unable to load metric history.");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          requestRef.current = null;
          setLoading(false);
        }
      });
  }, [minutes]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [refresh]);

  const chart = useMemo(() => buildMetricsChart(points, metric), [points, metric]);
  const label = metricLabels[metric];
  const color = chartColors[metric];
  const hasPoints = chart.points.length > 0;

  return <section className="metrics-history-card" aria-label="Historical system metrics" aria-busy={loading}>
    <div className="metrics-history-header">
      <div><p className="eyebrow">System history</p><h2>{label} usage</h2></div>
      <div className="metrics-history-controls" role="group" aria-label="Metric history range">
        {ranges.map((range) => <button key={range.minutes} type="button" className={minutes === range.minutes ? "active" : ""} onClick={() => setMinutes(range.minutes)} aria-pressed={minutes === range.minutes}>{range.label}</button>)}
      </div>
    </div>
    {error ? <div className="metrics-history-state" role="alert"><TriangleAlert size={18} /><span>{error}</span></div> : !hasPoints && !loading ? <div className="metrics-history-state"><span>Collecting history…</span><small>Snapshots appear after the first minute.</small></div> : <>
      {chart.summary && <div className="metrics-history-summary" aria-label={`${label} summary`}>
        <span><small>Latest</small><strong>{formatPercent(chart.summary.latest)}</strong></span>
        <span><small>Low</small><strong>{formatPercent(chart.summary.minimum)}</strong></span>
        <span><small>High</small><strong>{formatPercent(chart.summary.maximum)}</strong></span>
      </div>}
      <div className="metrics-chart-wrap">
        <svg className="metrics-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby={`${metric}-history-title ${metric}-history-description`}>
          <title id={`${metric}-history-title`}>{label} usage over the last {formatRange(minutes)}</title>
          <desc id={`${metric}-history-description`}>{chart.summary ? `${chart.points.length} readings. Latest ${formatPercent(chart.summary.latest)}, ranging from ${formatPercent(chart.summary.minimum)} to ${formatPercent(chart.summary.maximum)}.` : "Loading metric readings."}</desc>
          {buildGridLines(chart).map((line) => <g key={line.value}><line x1={CHART_PLOT.left} x2={CHART_WIDTH - CHART_PLOT.right} y1={line.y} y2={line.y} className="metrics-chart-grid" /><text x={CHART_PLOT.left - 8} y={line.y + 3} textAnchor="end" className="metrics-chart-label">{formatPercent(line.value)}</text></g>)}
          {hasPoints && <line x1={CHART_PLOT.left} x2={CHART_WIDTH - CHART_PLOT.right} y1={CHART_HEIGHT - CHART_PLOT.bottom} y2={CHART_HEIGHT - CHART_PLOT.bottom} className="metrics-chart-axis" />}
          {hasPoints && <polyline points={chart.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="metrics-chart-line" />}
          {chart.points.map((point) => <g key={point.timestamp}><circle cx={point.x} cy={point.y} r="5" fill={color} className="metrics-chart-point"><title>{`${formatChartTime(point.timestamp)} · ${formatPercent(point.value)}`}</title></circle><text x={point.x} y={point.y - 10} textAnchor="middle" className="metrics-chart-point-label">{formatPercent(point.value)}</text></g>)}
          {chart.timeLabels.map((timeLabel) => <text key={timeLabel.timestamp} x={timeLabel.x} y={CHART_HEIGHT - 14} textAnchor={timeLabel.x === CHART_PLOT.left ? "start" : timeLabel.x === CHART_WIDTH - CHART_PLOT.right ? "end" : "middle"} className="metrics-chart-time-label">{timeLabel.label}</text>)}
        </svg>
        {loading && <span className="metrics-history-loading"><RefreshCw size={14} className="spin" /> Updating</span>}
      </div>
      {hasPoints && <details className="metrics-history-readings">
        <summary>View readings</summary>
        <div className="metrics-history-table-wrap">
          <table><caption>{label} readings for the last {formatRange(minutes)}</caption><thead><tr><th scope="col">Time</th><th scope="col">Value</th></tr></thead><tbody>{chart.points.map((point) => <tr key={`reading-${point.timestamp}`}><td>{formatChartTime(point.timestamp)}</td><td>{formatPercent(point.value)}</td></tr>)}</tbody></table>
        </div>
      </details>}
    </>}
    <div className="metrics-history-footer"><span>{hasPoints ? `${chart.points.length} samples` : "No samples yet"}</span><span>Stored locally · 30-day retention</span></div>
  </section>;
}

function buildGridLines(chart: MetricsChartData) {
  const values = [chart.scale.minimum, (chart.scale.minimum + chart.scale.maximum) / 2, chart.scale.maximum];
  const plotHeight = CHART_HEIGHT - CHART_PLOT.top - CHART_PLOT.bottom;
  return values.map((value) => ({ value, y: CHART_PLOT.top + ((chart.scale.maximum - value) / chart.scale.range) * plotHeight }));
}

function formatRange(minutes: number) {
  return `${minutes} minutes`;
}

function formatPercent(value: number) {
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`;
}

async function fetchMetricHistory(minutes: number, signal: AbortSignal) {
  const response = await fetch(`/api/metrics/history?minutes=${minutes}`, { cache: "no-store", signal });
  const data = await response.json() as MetricHistoryResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load metric history.");
  return Array.isArray(data.points) ? data.points : [];
}
