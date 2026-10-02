/**
 * Comprehensive Evaluation Framework — 5-phase closed-loop diagnostic.
 *
 * Phase 1: Multi-scenario testing (4 data patterns with known ground truth)
 * Phase 2: Well-known metrics (MAE, MAPE, RMSE, R², MASE, Bias)
 * Phase 3: Weakness detection (identify specific failure modes)
 * Phase 4: Fine-tuning (grid-search momentumWeight, re-evaluate, compare)
 * Phase 5: Reliability verdict (overall score + actionable verdict)
 */

import { pipelineStrategicForecast, pipelineTacticalPrediction } from "@/lib/pipeline/PipelineBridge";
import { generateSyntheticIncidents, getGroundTruth } from "./syntheticData";

const DAY_MS = 24 * 3600 * 1000;

const SCENARIOS = [
  { id: "up_low", name: "صاعد + ضوضاء منخفض", params: { seed: 42, trendPerMonth: 0.02, smugglingRatio: 0.60 }, profile: "اتجاه تصاعدي 2%/شهر" },
  { id: "up_high", name: "صاعد + ضوضاء عالي", params: { seed: 99, trendPerMonth: 0.03, smugglingRatio: 0.55 }, profile: "اتجاه تصاعدي 3%/شهر" },
  { id: "down", name: "اتجاه هابط", params: { seed: 77, trendPerMonth: -0.015, smugglingRatio: 0.65 }, profile: "اتجاه هابط 1.5%/شهر" },
  { id: "seasonal", name: "موسمي بدون اتجاه", params: { seed: 55, trendPerMonth: 0.0, smugglingRatio: 0.50 }, profile: "موسمية فقط" },
];

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function lastDayOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function firstDayOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }

function computeMetrics(actuals, predictions) {
  const n = actuals.length;
  if (n === 0) return { mae: 0, rmse: 0, mape: 0, r2: 0, mase: 0, bias: 0, accuracy: 0 };
  const errors = actuals.map((a, i) => a - predictions[i]);
  const absErrors = errors.map(Math.abs);
  const sqErrors = errors.map((e) => e * e);
  const mae = absErrors.reduce((s, v) => s + v, 0) / n;
  const rmse = Math.sqrt(sqErrors.reduce((s, v) => s + v, 0) / n);
  const mape = actuals.reduce((s, a, i) => s + (a > 0 ? (Math.abs(a - predictions[i]) / a) * 100 : 0), 0) / n;
  const bias = errors.reduce((s, v) => s + v, 0) / n;
  const meanActual = actuals.reduce((s, v) => s + v, 0) / n;
  const ssRes = sqErrors.reduce((s, v) => s + v, 0);
  const ssTot = actuals.reduce((s, v) => s + (v - meanActual) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const naiveErrors = [];
  for (let i = 1; i < actuals.length; i++) naiveErrors.push(Math.abs(actuals[i] - actuals[i - 1]));
  const maeNaive = naiveErrors.length > 0 ? naiveErrors.reduce((s, v) => s + v, 0) / naiveErrors.length : mae;
  const mase = maeNaive > 0 ? mae / maeNaive : 1;
  return {
    mae: +mae.toFixed(2), rmse: +rmse.toFixed(2), mape: +mape.toFixed(1),
    r2: +r2.toFixed(3), mase: +mase.toFixed(3), bias: +bias.toFixed(2),
    accuracy: +Math.max(0, 100 - mape).toFixed(1),
  };
}

function evaluateStrategic(allIncidents) {
  const sorted = [...allIncidents].sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));
  const lastDate = new Date(sorted[sorted.length - 1].incident_date);
  const rows = [];
  for (let m = 5; m >= 0; m--) {
    const testMonthDate = new Date(lastDate.getFullYear(), lastDate.getMonth() - m, 1);
    const testMonthEnd = lastDayOfMonth(testMonthDate);
    const trainData = sorted.filter((i) => new Date(i.incident_date) < firstDayOfMonth(testMonthDate));
    const actual = sorted.filter((i) => {
      const d = new Date(i.incident_date);
      return d >= firstDayOfMonth(testMonthDate) && d <= testMonthEnd;
    });
    if (trainData.length < 20 || actual.length === 0) continue;
    let predicted = 0;
    try {
      const f = pipelineStrategicForecast(trainData, { horizon: 1, target: "incidents" });
      predicted = f.projection[0]?.value || 0;
    } catch (e) { predicted = 0; }
    rows.push({ month: monthKey(testMonthDate), actual: actual.length, predicted: +predicted.toFixed(1) });
  }
  const metrics = computeMetrics(rows.map((r) => r.actual), rows.map((r) => r.predicted));
  return {
    backtestMonths: rows.map((r) => ({
      ...r, error: +Math.abs(r.actual - r.predicted).toFixed(1),
      pctError: r.actual > 0 ? +(Math.abs(r.actual - r.predicted) / r.actual * 100).toFixed(1) : 0,
    })),
    ...metrics,
  };
}

function evaluateTactical(allIncidents, momentumWeight, modelName) {
  const mw = momentumWeight == null ? 0.4 : momentumWeight;
  const mn = modelName || "AdaptiveTrendModel";
  const sorted = [...allIncidents].sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));
  const lastDate = new Date(sorted[sorted.length - 1].incident_date);
  const cutoff = new Date(lastDate.getTime() - 14 * DAY_MS);
  const trainData = sorted.filter((i) => new Date(i.incident_date) <= cutoff);
  const testData = sorted.filter((i) => new Date(i.incident_date) > cutoff);
  if (trainData.length < 20 || testData.length === 0) return { error: "بيانات غير كافية" };

  let prediction;
  try { prediction = pipelineTacticalPrediction(trainData, { horizonDays: 14, momentumWeight: mw, model_name: mn }); }
  catch (e) { return { error: e.message }; }
  if (!prediction) return { error: "الأنبوب أعاد null" };

  const actualTotal = testData.length;
  const predictedTotal = prediction.when.totalExpectedIncidents;
  const totalPctError = actualTotal > 0 ? (Math.abs(actualTotal - predictedTotal) / actualTotal) * 100 : 0;

  const actualByGov = {};
  for (const i of testData) actualByGov[i.governorate] = (actualByGov[i.governorate] || 0) + 1;
  const actualRanking = Object.entries(actualByGov).sort((a, b) => b[1] - a[1]);
  const actualTopGov = actualRanking[0]?.[0];
  const predictedTopGov = prediction.where.governorate;
  const topGovCorrect = actualTopGov === predictedTopGov;
  const actualTop3 = actualRanking.slice(0, 3).map((r) => r[0]);
  const predictedTop3 = prediction.where.ranking.map((r) => r.governorate).slice(0, 3);
  const top3Overlap = actualTop3.filter((g) => predictedTop3.includes(g)).length;

  const actualDetained = testData.reduce((s, i) => s + (i.detained_count || 0), 0);
  const predictedDetained = prediction.howMany.expectedTotalDetained;
  const detainedPctError = actualDetained > 0 ? (Math.abs(actualDetained - predictedDetained) / actualDetained) * 100 : 0;

  const actualSmuggling = testData.filter((i) => i.incident_type === "تهريب").length;
  const actualInfiltration = testData.filter((i) => i.incident_type === "تسلل").length;
  const actualType = actualSmuggling >= actualInfiltration ? "تهريب" : "تسلل";
  const predictedType = prediction.howMany.predictedType;
  const typeCorrect = actualType === predictedType;

  return {
    totalActual: actualTotal, totalPredicted: +predictedTotal.toFixed(1),
    totalPctError: +totalPctError.toFixed(1), totalAccuracy: +(100 - totalPctError).toFixed(1),
    topGovActual: actualTopGov, topGovPredicted: predictedTopGov, topGovCorrect,
    top3Overlap, top3Max: Math.min(3, actualRanking.length),
    detainedActual: actualDetained, detainedPredicted: +predictedDetained.toFixed(1),
    detainedPctError: +detainedPctError.toFixed(1), detainedAccuracy: +(100 - detainedPctError).toFixed(1),
    typeActual: actualType, typePredicted: predictedType, typeCorrect,
    actualDailyRate: +(actualTotal / 14).toFixed(2), predictedDailyRate: +prediction.model.dailyRate.toFixed(2),
    actualByGov: actualRanking.map(([gov, count]) => ({ governorate: gov, count })),
    predictedRanking: prediction.where.ranking.slice(0, 5),
  };
}

function detectWeaknesses(scenarios) {
  const w = [];
  for (const s of scenarios) {
    if (s.strategic.accuracy < 80) {
      w.push({ severity: "عالية", area: "استراتيجي", scenario: s.name, issue: "دقة شهرية " + s.strategic.accuracy + "% أقل من 80%", detail: "MAE=" + s.strategic.mae + ", MAPE=" + s.strategic.mape + "%, R²=" + s.strategic.r2 });
    }
    if (s.tactical.error) {
      w.push({ severity: "عالية", area: "تكتيكي", scenario: s.name, issue: "فشل التقييم التكتيكي", detail: s.tactical.error });
      continue;
    }
    if (s.tactical.totalAccuracy < 70) {
      w.push({ severity: "عالية", area: "تكتيكي", scenario: s.name, issue: "دقة الحوادث " + s.tactical.totalAccuracy + "% أقل من 70%", detail: "متوقع " + s.tactical.totalPredicted + " vs فعلي " + s.tactical.totalActual });
    }
    if (s.tactical.detainedAccuracy < 60) {
      w.push({ severity: "عالية", area: "معتقلين", scenario: s.name, issue: "دقة المعتقلين " + s.tactical.detainedAccuracy + "% أقل من 60%", detail: "متوقع " + s.tactical.detainedPredicted + " vs فعلي " + s.tactical.detainedActual });
    }
    if (!s.tactical.topGovCorrect) {
      w.push({ severity: "متوسطة", area: "جغرافي", scenario: s.name, issue: "المحافظة الأعلى مخاطر غير صحيحة", detail: "متوقع " + s.tactical.topGovPredicted + " vs فعلي " + s.tactical.topGovActual });
    }
    const biasAbs = Math.abs(s.strategic.bias);
    if (biasAbs > 5) {
      const biasDir = s.strategic.bias > 0 ? "إيجابي (توقع زائد)" : "سلبي (توقع نقص)";
      w.push({ severity: "متوسطة", area: "انحياز", scenario: s.name, issue: "انحياز " + biasDir + " (" + s.strategic.bias + ")", detail: "النموذج يميل للإفراط/التفريط في التوقع" });
    }
    if (s.strategic.mase > 1) {
      w.push({ severity: "متوسطة", area: "أداء", scenario: s.name, issue: "MASE=" + s.strategic.mase + " أسوأ من التوقع الساذج", detail: "النموذج لا يتفوق على توقع آخر مشاهدة" });
    }
    for (const m of s.strategic.backtestMonths) {
      if (m.pctError > 30) {
        w.push({ severity: "متوسطة", area: "شهري", scenario: s.name, issue: "خطأ " + m.pctError + "% في " + m.month, detail: "فعلي " + m.actual + " vs متوقع " + m.predicted });
      }
    }
  }
  return w;
}

function gridSearchMomentumWeight(scenarioData) {
  const weights = [0.0, 0.2, 0.4, 0.6, 0.8];
  const models = ["AdaptiveTrendModel", "TrendSeasonalModel"];
  const results = [];
  const modelComparison = {};
  for (const w of weights) {
    let totalAcc = 0, totalDetAcc = 0, count = 0;
    for (const sd of scenarioData) {
      const tac = evaluateTactical(sd.incidents, w, "AdaptiveTrendModel");
      if (!tac.error) { totalAcc += tac.totalAccuracy; totalDetAcc += tac.detainedAccuracy; count++; }
    }
    results.push({
      momentumWeight: w,
      avgAccuracy: +(totalAcc / Math.max(1, count)).toFixed(1),
      avgDetainedAccuracy: +(totalDetAcc / Math.max(1, count)).toFixed(1),
    });
  }
  // Compare models at default weight
  for (const mn of models) {
    let totalAcc = 0, totalDetAcc = 0, count = 0;
    for (const sd of scenarioData) {
      const tac = evaluateTactical(sd.incidents, 0.4, mn);
      if (!tac.error) { totalAcc += tac.totalAccuracy; totalDetAcc += tac.detainedAccuracy; count++; }
    }
    modelComparison[mn] = {
      avgAccuracy: +(totalAcc / Math.max(1, count)).toFixed(1),
      avgDetainedAccuracy: +(totalDetAcc / Math.max(1, count)).toFixed(1),
    };
  }
  const best = results.reduce((a, b) => (a.avgAccuracy > b.avgAccuracy ? a : b));
  return { weights: results, best, modelComparison };
}

function assessReliability(scenarios, weaknesses) {
  const valid = scenarios.filter((s) => !s.tactical.error);
  const n = valid.length || 1;
  const avgStrategic = valid.reduce((s, r) => s + r.strategic.accuracy, 0) / n;
  const avgTactical = valid.reduce((s, r) => s + r.tactical.totalAccuracy, 0) / n;
  const avgDetained = valid.reduce((s, r) => s + r.tactical.detainedAccuracy, 0) / n;
  const topGovRate = valid.filter((r) => r.tactical.topGovCorrect).length / n;
  const typeRate = valid.filter((r) => r.tactical.typeCorrect).length / n;
  const overallScore = (avgStrategic + avgTactical + avgDetained + topGovRate * 100 + typeRate * 100) / 5;
  const criticalCount = weaknesses.filter((w) => w.severity === "عالية").length;
  let verdict, score;
  if (overallScore >= 85 && criticalCount <= 2) { verdict = "موثوق — جاهز كأداة دعم قرار"; score = "عالٍ"; }
  else if (overallScore >= 70) { verdict = "مقبول مع تحفظات — يحتاج تحسين قبل الاعتماد الكامل"; score = "متوسط"; }
  else { verdict = "غير موثوق — يحتاج تحسين جوهري"; score = "منخفض"; }
  return {
    avgStrategic: +avgStrategic.toFixed(1), avgTactical: +avgTactical.toFixed(1),
    avgDetained: +avgDetained.toFixed(1), topGovRate: +(topGovRate * 100).toFixed(0),
    typeRate: +(typeRate * 100).toFixed(0), overallScore: +overallScore.toFixed(1),
    verdict, score, weaknessCount: weaknesses.length, criticalCount,
  };
}

export function runComprehensiveEvaluation() {
  const scenarioData = [];
  const scenarioResults = [];

  for (const scenario of SCENARIOS) {
    const incidents = generateSyntheticIncidents(scenario.params);
    scenarioData.push({ ...scenario, incidents });
    const strategic = evaluateStrategic(incidents);
    const tactical = evaluateTactical(incidents, 0.4, "AdaptiveTrendModel");
    // Also evaluate with old model for comparison
    const tacticalOld = evaluateTactical(incidents, 0.4, "TrendSeasonalModel");
    scenarioResults.push({ id: scenario.id, name: scenario.name, profile: scenario.profile, strategic, tactical, tacticalOld });
  }

  const weaknesses = detectWeaknesses(scenarioResults);
  const fineTuning = gridSearchMomentumWeight(scenarioData);
  const reliability = assessReliability(scenarioResults, weaknesses);

  const tunedResults = scenarioData.map((sd) => evaluateTactical(sd.incidents, fineTuning.best.momentumWeight));
  const tunedAvg = tunedResults.reduce((s, r) => s + (r.totalAccuracy || 0), 0) / tunedResults.length;
  const tunedDetAvg = tunedResults.reduce((s, r) => s + (r.detainedAccuracy || 0), 0) / tunedResults.length;

  return {
    scenarios: scenarioResults,
    weaknesses,
    fineTuning: {
      ...fineTuning,
      tunedAvgAccuracy: +tunedAvg.toFixed(1),
      tunedDetAvgAccuracy: +tunedDetAvg.toFixed(1),
      improvement: +(tunedAvg - reliability.avgTactical).toFixed(1),
    },
    reliability,
    groundTruth: getGroundTruth(),
    syntheticSummary: {
      totalScenarios: SCENARIOS.length,
      totalIncidents: scenarioData.reduce((s, sd) => s + sd.incidents.length, 0),
    },
  };
}

export function runFullEvaluation() { return runComprehensiveEvaluation(); }