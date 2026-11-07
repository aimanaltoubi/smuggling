import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyTrainingHistory, horizonNaiveScale, metrics, seasonalNaiveScale } from "../src/lib/evaluation/metrics.js";

test("seasonal-naive scale uses a seven-day lag and is null for a constant history", () => {
  assert.equal(seasonalNaiveScale([0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0], 7), null);
  assert.equal(seasonalNaiveScale([0, 0, 0, 0, 0, 0, 0, 0, 0], 7), null);
  assert.equal(seasonalNaiveScale([0, 1], 7), null);
});

test("horizon scale compares equal-length aggregate windows", () => {
  assert.equal(horizonNaiveScale([1, 0, 1, 0, 1, 0, 1, 3, 0, 3, 0, 3, 0, 3], 7), 8);
  assert.equal(horizonNaiveScale([1, 1, 1], 7), null);
});

test("MASE is computed only when a positive training baseline scale exists", () => {
  const result = metrics([
    { actual: 10, predicted: 8, baseline: 6, scale: 2 },
    { actual: 12, predicted: 10, baseline: 8, scale: 2 },
  ]);
  assert.equal(result.mae, 2);
  assert.equal(result.mase, 1);
  assert.equal(metrics([{ actual: 0, predicted: 1, baseline: 0, scale: null }]).mase, null);
});

test("daily training series fills interior no-record days and excludes post-cutoff events", () => {
  const records = [
    { incident_date: "2026-01-01T10:00:00Z", detained_count: 2 },
    { incident_date: "2026-01-03T08:00:00Z", detained_count: 4 },
    { incident_date: "2026-01-05T08:00:00Z", detained_count: 99 },
  ];
  assert.deepEqual(buildDailyTrainingHistory(records.slice(0, 2), new Date("2026-01-04T00:00:00Z"), "incidents"), [1, 0, 1, 0]);
  assert.deepEqual(buildDailyTrainingHistory(records.slice(0, 2), new Date("2026-01-04T00:00:00Z"), "detained_count"), [2, 0, 4, 0]);
  assert.deepEqual(buildDailyTrainingHistory(records, new Date("2026-01-04T00:00:00Z"), "detained_count"), [2, 0, 4, 0]);
});