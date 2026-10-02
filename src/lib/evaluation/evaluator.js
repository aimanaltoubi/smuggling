/**
 * Backtesting evaluator — runs the REAL MLOps pipeline on synthetic data
 * with known ground truth, then compares predictions to held-out actuals.
 *
 * Two evaluations:
 *   1. Strategic forecast: hold out each of the last 6 months, predict, compare
 *   2. Tactical prediction: hold out last 14 days, predict, compare
 */

import { pipelineStrategicForecast, pipelineTacticalPrediction } from "@/lib/pipeline/PipelineBridge";
import { generateSyntheticIncidents, getGroundTruth } from "./syntheticData";

const DAY_MS = 24 * 3600 * 1000;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Strategic forecast backtesting:
 * For each of the last 6 months, train on all prior data, predict that month,
 * compare to actual.
 */
function evaluateStrategic(allIncidents) {
  const sorted = [...allIncidents].sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));
  const lastDate = new Date(sorted[sorted.length - 1].incident_date);
  const results = [];

  for (let m = 5; m >= 0; m--) {
    // The test month: m months before the last data month
    const testMonthDate = new Date(lastDate.getFullYear(), lastDate.getMonth() - m, 1);
    const testMonthEnd = lastDayOfMonth(testMonthDate);

    // Training data: everything before the test month
    const trainData = sorted.filter((i) => new Date(i.incident_date) < firstDayOfMonth(testMonthDate));

    // Actual incidents in the test month
    const actual = sorted.filter((i) => {
      const d = new Date(i.incident_date);
      return d >= firstDayOfMonth(testMonthDate) && d <= testMonthEnd;
    });

    if (trainData.length < 20 || actual.length === 0) continue;

    // Run the real pipeline on training data
    let predicted = 0;
    try {
      const forecast = pipelineStrategicForecast(trainData, { horizon: 1, target: "incidents" });
      predicted = forecast.projection[0]?.value || 0;
    } catch (e) {
      predicted = 0;
    }

    const error = Math.abs(actual.length - predicted);
    const pctError = actual.length > 0 ? (error / actual.length) * 100 : 0;

    results.push({
      month: monthKey(testMonthDate),
      actual: actual.length,
      predicted: +predicted.toFixed(1),
      error: +error.toFixed(1),
      pctError: +pctError.toFixed(1),
    });
  }

  const mae = results.length ? results.reduce((s, r) => s + r.error, 0) / results.length : 0;
  const mape = results.length ? results.reduce((s, r) => s + r.pctError, 0) / results.length : 0;
  const bias = results.length ? results.reduce((s, r) => s + (r.predicted - r.actual), 0) / results.length : 0;
  const accuracy = Math.max(0, 100 - mape);

  return { backtestMonths: results, mae: +mae.toFixed(2), mape: +mape.toFixed(1), bias: +bias.toFixed(2), accuracy: +accuracy.toFixed(1) };
}

/**
 * Tactical prediction backtesting:
 * Hold out the last 14 days, train on the rest, predict, compare.
 */
function evaluateTactical(allIncidents) {
  const sorted = [...allIncidents].sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));
  const lastDate = new Date(sorted[sorted.length - 1].incident_date);

  const cutoff = new Date(lastDate.getTime() - 14 * DAY_MS);
  const trainData = sorted.filter((i) => new Date(i.incident_date) <= cutoff);
  const testData = sorted.filter((i) => new Date(i.incident_date) > cutoff);

  if (trainData.length < 20 || testData.length === 0) {
    return { error: "Insufficient data for tactical backtest" };
  }

  let prediction;
  try {
    prediction = pipelineTacticalPrediction(trainData, { horizonDays: 14 });
  } catch (e) {
    return { error: e.message };
  }

  if (!prediction) return { error: "Pipeline returned null" };

  // Total incidents
  const actualTotal = testData.length;
  const predictedTotal = prediction.when.totalExpectedIncidents;
  const totalError = Math.abs(actualTotal - predictedTotal);
  const totalPctError = actualTotal > 0 ? (totalError / actualTotal) * 100 : 0;

  // Governorate accuracy
  const actualByGov = {};
  for (const i of testData) {
    actualByGov[i.governorate] = (actualByGov[i.governorate] || 0) + 1;
  }
  const actualRanking = Object.entries(actualByGov).sort((a, b) => b[1] - a[1]);
  const actualTopGov = actualRanking[0]?.[0];
  const predictedTopGov = prediction.where.governorate;
  const topGovCorrect = actualTopGov === predictedTopGov;

  // Top-3 overlap
  const actualTop3 = actualRanking.slice(0, 3).map((r) => r[0]);
  const predictedRanking = prediction.where.ranking.map((r) => r.governorate);
  const predictedTop3 = predictedRanking.slice(0, 3);
  const top3Overlap = actualTop3.filter((g) => predictedTop3.includes(g)).length;

  // Detained
  const actualDetained = testData.reduce((s, i) => s + (i.detained_count || 0), 0);
  const predictedDetained = prediction.howMany.expectedTotalDetained;
  const detainedError = Math.abs(actualDetained - predictedDetained);
  const detainedPctError = actualDetained > 0 ? (detainedError / actualDetained) * 100 : 0;

  // Type
  const actualSmuggling = testData.filter((i) => i.incident_type === "تهريب").length;
  const actualInfiltration = testData.filter((i) => i.incident_type === "تسلل").length;
  const actualType = actualSmuggling >= actualInfiltration ? "تهريب" : "تسلل";
  const predictedType = prediction.howMany.predictedType;
  const typeCorrect = actualType === predictedType;

  // Daily rate accuracy
  const actualDailyRate = actualTotal / 14;
  const predictedDailyRate = prediction.model.dailyRate;
  const dailyRateError = Math.abs(actualDailyRate - predictedDailyRate);

  return {
    totalActual: actualTotal,
    totalPredicted: +predictedTotal.toFixed(1),
    totalError: +totalError.toFixed(1),
    totalPctError: +totalPctError.toFixed(1),
    totalAccuracy: +(100 - totalPctError).toFixed(1),
    topGovActual: actualTopGov,
    topGovPredicted: predictedTopGov,
    topGovCorrect,
    top3Overlap,
    top3Max: Math.min(3, actualRanking.length),
    detainedActual: actualDetained,
    detainedPredicted: +predictedDetained.toFixed(1),
    detainedError: +detainedError.toFixed(1),
    detainedPctError: +detainedPctError.toFixed(1),
    detainedAccuracy: +(100 - detainedPctError).toFixed(1),
    typeActual: actualType,
    typePredicted: predictedType,
    typeCorrect,
    actualDailyRate: +actualDailyRate.toFixed(2),
    predictedDailyRate: +predictedDailyRate.toFixed(2),
    dailyRateError: +dailyRateError.toFixed(2),
    actualByGov: actualRanking.map(([gov, count]) => ({ governorate: gov, count })),
    predictedRanking: prediction.where.ranking.slice(0, 5),
  };
}

export function runFullEvaluation() {
  const incidents = generateSyntheticIncidents();
  const groundTruth = getGroundTruth();

  const dates = incidents.map((i) => new Date(i.incident_date)).sort((a, b) => a - b);
  const byType = incidents.reduce((acc, i) => { acc[i.incident_type] = (acc[i.incident_type] || 0) + 1; return acc; }, {});
  const byGov = incidents.reduce((acc, i) => { acc[i.governorate] = (acc[i.governorate] || 0) + 1; return acc; }, {});

  const strategic = evaluateStrategic(incidents);
  const tactical = evaluateTactical(incidents);

  return {
    syntheticSummary: {
      totalIncidents: incidents.length,
      dateStart: dates[0].toISOString().split("T")[0],
      dateEnd: dates[dates.length - 1].toISOString().split("T")[0],
      governorates: Object.keys(byGov).length,
      byType,
      byGov,
    },
    groundTruth,
    strategic,
    tactical,
  };
}