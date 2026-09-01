import type { HistoricalMetric } from "./types";

export type ChartMetric = "cpu" | "memory";
export type ChartPoint = {
  timestamp: string;
  value: number;
  x: number;
  y: number;
};
export type ChartTimeLabel = {
  timestamp: string;
  label: string;
  x: number;
};
export type ChartSummary = {
  latest: number;
  minimum: number;
  maximum: number;
  average: number;
};
export type ChartScale = {
  minimum: number;
  maximum: number;
  range: number;
};
export type MetricsChartData = {
  points: ChartPoint[];
  timeLabels: ChartTimeLabel[];
  summary: ChartSummary | null;
  scale: ChartScale;
};

export const CHART_WIDTH = 800;
export const CHART_HEIGHT = 280;
export const CHART_PLOT = {
  left: 48,
  right: 16,
  top: 18,
  bottom: 42,
};

const MINIMUM_SCALE_RANGE = 10;
const MINIMUM_SCALE_VALUE = 0;
const MAXIMUM_SCALE_VALUE = 100;

export function buildMetricsChart(points: HistoricalMetric[], metric: ChartMetric, formatTime = formatChartTime): MetricsChartData {
  const normalizedPoints = normalizeChartPoints(points, metric);
  const values = normalizedPoints.map((point) => point.value);
  const scale = getChartScale(values);
  const plotWidth = CHART_WIDTH - CHART_PLOT.left - CHART_PLOT.right;
  const plotHeight = CHART_HEIGHT - CHART_PLOT.top - CHART_PLOT.bottom;
  const denominator = Math.max(1, normalizedPoints.length - 1);
  const chartPoints = normalizedPoints.map((point, index) => ({
    ...point,
    x: CHART_PLOT.left + (index / denominator) * plotWidth,
    y: CHART_PLOT.top + ((scale.maximum - point.value) / scale.range) * plotHeight,
  }));
  const summary = values.length ? {
    latest: values[values.length - 1],
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((total, value) => total + value, 0) / values.length,
  } : null;

  return {
    points: chartPoints,
    timeLabels: buildTimeLabels(chartPoints, formatTime),
    summary,
    scale,
  };
}

export function normalizeChartPoints(points: HistoricalMetric[], metric: ChartMetric) {
  return points
    .map((point) => ({
      timestamp: point.timestamp,
      value: clampMetricValue(point[metric]),
      time: Date.parse(point.timestamp),
    }))
    .filter((point) => point.timestamp.length > 0 && Number.isFinite(point.time))
    .sort((left, right) => left.time - right.time)
    .map(({ timestamp, value }) => ({ timestamp, value }));
}

export function clampMetricValue(value: number) {
  return Number.isFinite(value) ? Math.min(MAXIMUM_SCALE_VALUE, Math.max(MINIMUM_SCALE_VALUE, value)) : 0;
}

export function getChartScale(values: number[]): ChartScale {
  if (!values.length) return { minimum: 0, maximum: 100, range: 100 };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const center = (minimum + maximum) / 2;
  const range = Math.max(MINIMUM_SCALE_RANGE, maximum - minimum);
  const padding = Math.max(2, range * 0.2);
  const boundedMinimum = Math.max(MINIMUM_SCALE_VALUE, Math.floor((center - range / 2 - padding) * 10) / 10);
  const boundedMaximum = Math.min(MAXIMUM_SCALE_VALUE, Math.ceil((center + range / 2 + padding) * 10) / 10);
  const adjustedRange = boundedMaximum - boundedMinimum;
  return {
    minimum: boundedMinimum,
    maximum: boundedMaximum,
    range: adjustedRange,
  };
}

export function buildTimeLabels(points: ChartPoint[], formatTime = formatChartTime): ChartTimeLabel[] {
  if (!points.length) return [];
  const indexes = points.length <= 3
    ? points.map((_, index) => index)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return [...new Set(indexes)].map((index) => ({
    timestamp: points[index].timestamp,
    label: formatTime(points[index].timestamp),
    x: points[index].x,
  }));
}

export function formatChartTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
