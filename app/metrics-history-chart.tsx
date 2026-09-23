"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { HistoricalMetric } from "@/lib/types";
import { buildMetricsChart, CHART_HEIGHT, CHART_PLOT, CHART_WIDTH, formatChartPercent, formatChartSummary, type ChartMetric, type MetricsChartData } from "@/lib/metrics-chart";
import { shouldApplyMetricsHistoryRequest } from "@/lib/metrics-history-request";

type MetricHistoryResponse = { minutes: number; points: HistoricalMetric[] };

const LIVE_HISTORY_MINUTES = 5;
const ranges = [
  { minutes: LIVE_HISTORY_MINUTES, label: "Live" },
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
];
const chartColors: Record<ChartMetric, string> = { cpu: "#b9e394", memory: "#b9c7d8" };
const metricLabels: Record<ChartMetric, string> = { cpu: "CPU", memory: "Memory" };

export default function MetricsHistoryChart({ metric }: { metric: ChartMetric }) {
  const [minutes, setMinutes] = useState(LIVE_HISTORY_MINUTES);
  const [points, setPoints] = useState<HistoricalMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const isLive = minutes === LIVE_HISTORY_MINUTES;

  const refresh = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestRef.current = controller;
    setLoading(true);
    setError("");

    void fetchMetricHistory(minutes, controller.signal)
      .then((nextPoints) => {
        if (!shouldApplyMetricsHistoryRequest(requestId, requestIdRef.current, controller.signal)) return;
        setPoints(nextPoints);
        setError("");
      })
      .catch((caught) => {
        if (!shouldApplyMetricsHistoryRequest(requestId, requestIdRef.current, controller.signal)) return;
        setError(caught instanceof Error ? caught.message : "Unable to load metric history.");
      })
      .finally(() => {
        if (shouldApplyMetricsHistoryRequest(requestId, requestIdRef.current, controller.signal)) {
          requestRef.current = null;
          setLoading(false);
        }
      });
  }, [minutes]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const interval = isLive ? window.setInterval(refresh, 30_000) : undefined;
    return () => {
      window.clearTimeout(initialRefresh);
      if (interval !== undefined) window.clearInterval(interval);
      requestIdRef.current += 1;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [refresh, isLive]);

  const chart = useMemo(() => buildMetricsChart(points, metric), [points, metric]);
  const label = metricLabels[metric];
  const color = chartColors[metric];
  const hasPoints = chart.points.length > 0;
  const chartTitle = isLive
    ? `${label} usage live over the last ${LIVE_HISTORY_MINUTES} minutes`
    : `${label} usage over the last ${minutes} minutes`;

  return <section className="metrics-history-card" aria-label="Historical system metrics" aria-busy={loading}>
    <div className="metrics-history-header">
      <div className="metrics-history-heading"><h2>{label} usage</h2>{chart.summary && <strong className="metrics-history-current">{formatChartPercent(chart.summary.latest)}</strong>}</div>
      <div className="metrics-history-controls" role="group" aria-label="Metric history range">
        {ranges.map((range) => <button key={range.minutes} type="button" className={minutes === range.minutes ? "active" : ""} onClick={() => setMinutes(range.minutes)} aria-pressed={minutes === range.minutes}>{range.label}</button>)}
      </div>
    </div>
    {error ? <div className="metrics-history-state" role="alert"><TriangleAlert size={18} /><span>{error}</span></div> : !hasPoints && !loading ? <div className="metrics-history-state"><span>Collecting history…</span><small>Snapshots appear after the first minute.</small></div> : <>
      <div className="metrics-chart-wrap">
        <svg className="metrics-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby={`${metric}-history-title ${metric}-history-description`}>
          <title id={`${metric}-history-title`}>{chartTitle}</title>
          <desc id={`${metric}-history-description`}>{chart.summary ? formatChartSummary(chart.summary) : "Loading metric readings."}</desc>
          <g aria-hidden="true">{buildGridLines(chart).map((line) => <g key={line.value}><line x1={CHART_PLOT.left} x2={CHART_WIDTH - CHART_PLOT.right} y1={line.y} y2={line.y} className="metrics-chart-grid" /><text x={CHART_PLOT.left - 8} y={line.y + 3} textAnchor="end" className="metrics-chart-label">{formatChartPercent(line.value)}</text></g>)}</g>
          <g aria-hidden="true">
            {hasPoints && <line x1={CHART_PLOT.left} x2={CHART_WIDTH - CHART_PLOT.right} y1={CHART_HEIGHT - CHART_PLOT.bottom} y2={CHART_HEIGHT - CHART_PLOT.bottom} className="metrics-chart-axis" />}
            {hasPoints && <polygon points={`${chart.points[0].x},${CHART_HEIGHT - CHART_PLOT.bottom} ${chart.points.map((point) => `${point.x},${point.y}`).join(" ")} ${chart.points[chart.points.length - 1].x},${CHART_HEIGHT - CHART_PLOT.bottom}`} fill={color} className="metrics-chart-area" />}
            {hasPoints && <polyline points={chart.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="metrics-chart-line" />}
          </g>
        </svg>
        {loading && <span className="metrics-history-loading"><RefreshCw size={14} className="spin" /> Updating</span>}
      </div>
    </>}
  </section>;
}

function buildGridLines(chart: MetricsChartData) {
  const values = [chart.scale.minimum, (chart.scale.minimum + chart.scale.maximum) / 2, chart.scale.maximum];
  const plotHeight = CHART_HEIGHT - CHART_PLOT.top - CHART_PLOT.bottom;
  return values.map((value) => ({ value, y: CHART_PLOT.top + ((chart.scale.maximum - value) / chart.scale.range) * plotHeight }));
}

async function fetchMetricHistory(minutes: number, signal: AbortSignal) {
  const response = await fetch(`/api/metrics/history?minutes=${minutes}`, { cache: "no-store", signal });
  const data = await response.json() as MetricHistoryResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load metric history.");
  return Array.isArray(data.points) ? data.points : [];
}
