import assert from "node:assert/strict";
import test from "node:test";
import type { HistoricalMetric } from "./types.ts";
import { buildMetricsChart, buildTimeLabels, clampMetricValue, getChartScale, normalizeChartPoints } from "./metrics-chart.ts";

function point(timestamp: string, cpu: number, memory = cpu): HistoricalMetric {
  return { timestamp, cpu, memory, storage: 40, temperatureC: null, powerWatts: null };
}

test("normalizes points chronologically and clamps metric values", () => {
  const points = normalizeChartPoints([
    point("2026-09-01T10:02:00.000Z", 120),
    point("2026-09-01T10:00:00.000Z", -4),
    point("2026-09-01T10:01:00.000Z", 42),
  ], "cpu");

  assert.deepEqual(points, [
    { timestamp: "2026-09-01T10:00:00.000Z", value: 0 },
    { timestamp: "2026-09-01T10:01:00.000Z", value: 42 },
    { timestamp: "2026-09-01T10:02:00.000Z", value: 100 },
  ]);
  assert.equal(clampMetricValue(Number.NaN), 0);
});

test("uses a padded readable scale for flat low-variance values", () => {
  const scale = getChartScale([37, 37, 37]);
  const chart = buildMetricsChart([
    point("2026-09-01T10:00:00.000Z", 37),
    point("2026-09-01T10:01:00.000Z", 37),
  ], "cpu");

  assert.ok(scale.range >= 10);
  assert.ok(scale.minimum < 37);
  assert.ok(scale.maximum > 37);
  assert.ok(chart.points.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)));
  assert.equal(chart.points[0].x, 48);
  assert.equal(chart.points[1].x, 784);
  assert.ok(chart.points[0].y > 18 && chart.points[0].y < 238);
});

test("creates a visible one-sample chart and summary", () => {
  const chart = buildMetricsChart([point("2026-09-01T10:00:00.000Z", 12.5)], "cpu", () => "10:00");

  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0].x, 48);
  assert.ok(chart.points[0].y > 18 && chart.points[0].y < 238);
  assert.deepEqual(chart.summary, { latest: 12.5, minimum: 12.5, maximum: 12.5, average: 12.5 });
  assert.deepEqual(chart.timeLabels, [{ timestamp: "2026-09-01T10:00:00.000Z", label: "10:00", x: 48 }]);
});

test("keeps a full-range scale when values reach the percentage boundaries", () => {
  const chart = buildMetricsChart([point("2026-09-01T10:00:00.000Z", 0), point("2026-09-01T10:01:00.000Z", 100)], "cpu");

  assert.deepEqual(chart.scale, { minimum: 0, maximum: 100, range: 100 });
  assert.deepEqual(chart.points.map((item) => item.y), [238, 18]);
});

test("keeps time labels bounded while preserving the first, middle, and last readings", () => {
  const points = Array.from({ length: 30 }, (_, index) => point(`2026-09-01T10:${String(index).padStart(2, "0")}:00.000Z`, index));
  const chart = buildMetricsChart(points, "memory", (timestamp) => timestamp.slice(14, 16));

  assert.equal(chart.timeLabels.length, 3);
  assert.deepEqual(chart.timeLabels.map((item) => item.label), ["00", "14", "29"]);
  assert.deepEqual(chart.timeLabels.map((item) => item.x), [48, 403.3103448275862, 784]);
});

test("returns no chart readings for empty or invalid timestamps", () => {
  const chart = buildMetricsChart([point("not-a-timestamp", 50)], "memory");

  assert.deepEqual(chart.points, []);
  assert.deepEqual(chart.timeLabels, []);
  assert.equal(chart.summary, null);
});

test("labels every point when a chart has three or fewer readings", () => {
  const points = [
    { timestamp: "first", x: 48 } as never,
    { timestamp: "last", x: 736 } as never,
  ];
  assert.deepEqual(buildTimeLabels(points, (timestamp) => timestamp), [
    { timestamp: "first", label: "first", x: 48 },
    { timestamp: "last", label: "last", x: 736 },
  ]);
});
