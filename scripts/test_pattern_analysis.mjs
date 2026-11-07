import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSeries, prepareAnalysisFacts } from "../src/lib/analytics/numericalAnalysis.js";

test("detects descriptive intermittency without claiming annual seasonality", () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ label: `2026-${String(index + 2).padStart(2, "0")}`, value: index % 2 ? 0 : 10 }));
  const result = analyzeSeries(rows);
  assert.equal(result.total, 60);
  assert.equal(result.mean, 5.45);
  assert.equal(result.zeroPeriods, 5);
  assert.equal(result.repeatedLag, 2);
  assert.equal(result.annualPattern, "insufficient-history");
  assert.equal(result.descriptiveMonthlySlope, 0);
});

test("a constant forecast can match the recent mean despite variable history", () => {
  const facts = prepareAnalysisFacts({ target: "عدد الحوادث", recentMonthlyActuals: [{ period: "2026-10", actual: 10 }, { period: "2026-11", actual: 0 }, { period: "2026-12", actual: 10 }], projectedMonthlyValues: [{ period: "2027-01", value: 6.67 }, { period: "2027-02", value: 6.67 }] });
  assert.equal(facts.computedAnalysis.projected.minimum, 6.67);
  assert.equal(facts.computedAnalysis.matchesRecentMean, true);
  assert.equal(facts.computedAnalysis.projected.standardDeviation, 0);
  assert.equal(facts.computedAnalysis.yearlyTotals[0].total, 13.34);
});

test("targets remain separate and empty histories do not invent comparisons", () => {
  const facts = prepareAnalysisFacts({ target: "عدد المعتقلين", observedEvidence: { recentMonthlyObserved: [{ label: "2026-02", incidents: 10, detained: 40 }] }, projectedMonthlyValues: [{ period: "2027-01", value: 20 }] });
  assert.equal(facts.computedAnalysis.historical.mean, 40);
  assert.equal(facts.computedAnalysis.forecastVsHistoricalPercent, -50);
  assert.equal(prepareAnalysisFacts({}).computedAnalysis.forecastVsHistoricalPercent, null);
});

test("descriptive slope and recent change capture a rising sequence", () => {
  const result = analyzeSeries([1, 2, 3, 4, 5, 6].map((value, index) => ({ label: String(index), value })));
  assert.equal(result.descriptiveMonthlySlope, 1);
  assert.equal(result.recentChange, 3);
  assert.equal(result.maximum, 6);
});

test("percentage comparisons use full precision and unlabeled values are safe", () => {
  const months = Array.from({ length: 11 }, (_, index) => ({ label: `2026-${String(index + 2).padStart(2, "0")}`, incidents: index % 2 ? 0 : 10 }));
  const facts = prepareAnalysisFacts({ observedEvidence: { recentMonthlyObserved: months }, projectedMonthlyValues: [{ value: 6.67 }] });
  assert.equal(facts.computedAnalysis.forecastVsHistoricalPercent, 22.28);
  assert.deepEqual(facts.computedAnalysis.yearlyTotals, []);
});

test("daily forecasts are not compared with monthly observation totals", () => {
  const facts = prepareAnalysisFacts({ observedEvidence: { recentMonthlyObserved: [{ label: "2026-01", incidents: 30 }] }, dailyIncidentForecast: [{ date: "2026-02-01", expectedIncidents: 1 }], recentDailyRate: 1 });
  assert.equal(facts.computedAnalysis.forecastUnit, "day");
  assert.equal(facts.computedAnalysis.forecastVsHistoricalPercent, null);
  assert.equal(facts.computedAnalysis.matchesRecentMean, true);
});

test("short cycles are not labeled as annual seasonality simply because they repeat at twelve months", () => {
  const result = analyzeSeries(Array.from({ length: 36 }, (_, index) => ({ label: String(index), value: index % 2 ? 0 : 10 })));
  assert.equal(result.repeatedLag, 2);
  assert.equal(result.annualPattern, "shorter-cycle-recurrence");
});