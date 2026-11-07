import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BORDER_DISTANCE_KM, buildBorderStatistics } from "../src/lib/analytics/borderAnalytics.js";

const boundaries = JSON.parse(readFileSync(new URL("../src/lib/analytics/omanBoundaries.json", import.meta.url), "utf8"));
const fixture = [
  { type: "Feature", properties: { id: "west", name: "West" }, geometry: { type: "MultiLineString", coordinates: [[[54, 21], [55, 21]]] } },
  { type: "Feature", properties: { id: "east", name: "East" }, geometry: { type: "MultiLineString", coordinates: [[[56, 21], [57, 21]]] } },
];
const incident = (latitude, longitude, detained = 2) => ({ latitude, longitude, detained_count: detained, incident_type: "test" });

test("counts the nearest geographic line once and preserves totals", () => {
  const results = buildBorderStatistics([incident(21, 54.5), incident(21, 56.5), incident(21, 54.5)], fixture);
  assert.deepEqual(results.map(result => result.count), [2, 1]);
  assert.deepEqual(results.map(result => result.detained), [4, 2]);
  assert.equal(results[0].types.test, 2);
});

test("does not assign interior incidents outside the stated distance", () => {
  assert.equal(BORDER_DISTANCE_KM, 25);
  const results = buildBorderStatistics([incident(21.22, 54.5), incident(21.23, 54.5), incident(22, 54.5)], fixture);
  assert.deepEqual(results.map(result => result.count), [1, 0]);
});

test("ignores missing, nonfinite and out-of-range coordinates", () => {
  const results = buildBorderStatistics([incident(null, 54), incident(NaN, 54), incident(Infinity, 54), incident(91, 54), incident(21, 181)], fixture);
  assert.deepEqual(results.map(result => result.count), [0, 0]);
});

test("bundles geographic lines rather than rectangular sectors", () => {
  assert.deepEqual(boundaries.features.map(feature => feature.properties.id), ["uae", "saudi", "yemen", "coast"]);
  for (const feature of boundaries.features) {
    assert.equal(feature.geometry.type, "MultiLineString");
    assert(feature.geometry.coordinates.length > 0);
    assert(feature.geometry.coordinates.every(line => line.length >= 2 && line.every(coordinate => coordinate.every(Number.isFinite))));
  }
});

test("sample point is near the UAE border while inland Nizwa is unassigned", () => {
  const results = buildBorderStatistics([incident(24.32328749, 56.05538849, 1), incident(22.93, 57.53, 1)], boundaries.features);
  assert.deepEqual(results.map(result => result.count), [1, 0, 0, 0]);
});