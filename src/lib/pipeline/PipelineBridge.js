/**
 * PipelineBridge — the single entry point through which the app obtains
 * forecasts. The MLOps pipeline IS the prediction engine; this module converts
 * its output into the shapes the UI sections expect.
 *
 * Two bridges:
 *   pipelineStrategicForecast  → seasonal multi-month projection (ForecastSection)
 *   pipelineTacticalPrediction → next-event daily prediction (PredictionSection, IncidentMap, Overview)
 *
 * JS mirror of python_reference/pipeline/bridge.py.
 */

import { runPipeline } from "./pipeline";
import { toMonthId, monthIdToDate } from "./ViewsDataLoader";

const DAY_MS = 24 * 3600 * 1000;
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "-";
  return `${dt.getDate()} ${MONTHS_AR[dt.getMonth()]} ${dt.getFullYear()}`;
}

function monthIdToPeriod(mid) {
  const d = monthIdToDate(mid);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Historical monthly series from raw incidents (replaces analytics/forecasting.buildMonthlySeries)
function buildHistoricalMonthly(incidents, metric) {
  const map = {};
  for (const r of incidents) {
    if (!r.incident_date || isNaN(new Date(r.incident_date))) continue;
    const mid = toMonthId(r.incident_date);
    if (!map[mid]) map[mid] = { month_id: mid, period: monthIdToPeriod(mid), date: monthIdToDate(mid), incidents: 0, detained: 0 };
    map[mid].incidents += 1;
    map[mid].detained += r.detained_count || 0;
  }
  return Object.values(map).sort((a, b) => a.month_id - b.month_id);
}

// Sum pipeline projections across entities → one total per month
function aggregateByMonth(projections) {
  const byMonth = new Map();
  for (const p of projections || []) {
    if (!byMonth.has(p.month_id)) byMonth.set(p.month_id, { value: 0, ci_lower: 0, ci_upper: 0 });
    const c = byMonth.get(p.month_id);
    c.value += p.value || 0;
    c.ci_lower += p.ci_lower || 0;
    c.ci_upper += p.ci_upper || 0;
  }
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([mid, c]) => ({
    month_id: mid, period: monthIdToPeriod(mid), date: monthIdToDate(mid),
    value: +c.value.toFixed(2), lower95: +c.ci_lower.toFixed(2), upper95: +c.ci_upper.toFixed(2),
  }));
}

/**
 * Strategic seasonal forecast — runs the MLOps pipeline and returns a
 * TypeForecast-compatible result: historical monthly series + multi-month
 * projection with confidence intervals.
 */
export function pipelineStrategicForecast(incidents, opts = {}) {
  const { target = "incidents", level = "governorate", horizon = 48, model_name = "AverageModel" } = opts;
  const pipelineTarget = target === "detained" ? "detained_count" : "incidents";

  const result = runPipeline(incidents, {
    model_name, target: pipelineTarget, level, horizon_months: horizon,
    train: true, evaluate: true, forecast: true, report: false,
  });

  const historical = buildHistoricalMonthly(incidents, target);
  const projection = aggregateByMonth(result.forecast?.projections || []);

  return {
    historical,
    projection,
    params: { model: model_name, family: result.train?.artifact?.model_family, target: pipelineTarget, level },
    residStd: result.evaluate?.ts_metrics?.overall_rmse || 0,
    metrics: result.evaluate?.ts_metrics || {},
    reconciliation: result.forecast?.reconciliation || null,
    provenance: { model_name, target: pipelineTarget, level, stages: result.stages, run_id: result.run_id },
  };
}

/**
 * Tactical next-event prediction — runs the MLOps pipeline for both targets
 * (incidents + detained) at governorate level and derives a daily prediction
 * in the shape PredictionSection and IncidentMap expect.
 */
export function pipelineTacticalPrediction(incidents, opts = {}) {
  const { horizonDays = 14, model_name = "AverageModel" } = opts;

  const incResult = runPipeline(incidents, { model_name, target: "incidents", level: "governorate", horizon_months: 12, train: true, evaluate: true, forecast: true, report: false });
  const detResult = runPipeline(incidents, { model_name, target: "detained_count", level: "governorate", horizon_months: 12, train: true, evaluate: true, forecast: true, report: false });

  const valid = incidents.filter((i) => i.incident_date && !isNaN(new Date(i.incident_date)));
  if (valid.length < 2) return null;
  valid.sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));
  const dataStartDate = new Date(valid[0].incident_date);
  const dataEndDate = new Date(valid[valid.length - 1].incident_date);
  const totalDays = Math.max(1, Math.round((dataEndDate - dataStartDate) / DAY_MS) + 1);

  const forecastStart = new Date(dataEndDate.getTime() + DAY_MS);
  const forecastEnd = new Date(dataEndDate.getTime() + horizonDays * DAY_MS);

  // First forecast month from pipeline → daily rate
  const incProjections = incResult.forecast?.projections || [];
  const forecastMonths = [...new Set(incProjections.map((p) => p.month_id))].sort((a, b) => a - b);
  const firstMonth = forecastMonths[0];
  const firstMonthIncidents = incProjections.filter((p) => p.month_id === firstMonth).reduce((s, p) => s + (p.value || 0), 0);
  const dailyRate = firstMonthIncidents / 30;

  // Daily breakdown (flat from pipeline monthly rate)
  const dailyForecast = [];
  let totalExpected = 0;
  for (let d = new Date(forecastStart); d <= forecastEnd; d = new Date(d.getTime() + DAY_MS)) {
    const expected = +dailyRate.toFixed(3);
    dailyForecast.push({ date: new Date(d), label: fmtDate(d), expected });
    totalExpected += expected;
  }
  totalExpected = +totalExpected.toFixed(2);
  const peak = dailyForecast.reduce((a, b) => (b.expected > a.expected ? b : a), dailyForecast[0]);

  // Spatial risk from governorate-level projections (first forecast month)
  const govScores = {};
  for (const p of incProjections) {
    if (p.month_id === firstMonth) govScores[p.entity_id] = (govScores[p.entity_id] || 0) + (p.value || 0);
  }
  const govTotal = Object.values(govScores).reduce((a, b) => a + b, 0) || 1;
  const ranking = Object.entries(govScores)
    .map(([gov, score]) => ({ governorate: gov, score: +(score / govTotal).toFixed(3), rawScore: +score.toFixed(2), incidents: 0, detained: 0 }))
    .sort((a, b) => b.rawScore - a.rawScore);
  for (const r of valid) {
    const g = r.governorate || "غير محدد";
    const entry = ranking.find((e) => e.governorate === g);
    if (entry) { entry.incidents += 1; entry.detained += r.detained_count || 0; }
  }
  const topGov = ranking[0]?.governorate || valid[0]?.governorate;
  const topLoc = valid.filter((i) => i.governorate === topGov).sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date))[0];

  // Detained from pipeline
  const detProjections = detResult.forecast?.projections || [];
  const firstMonthDetained = detProjections.filter((p) => p.month_id === firstMonth).reduce((s, p) => s + (p.value || 0), 0);
  const expectedTotalDetained = +(firstMonthDetained * (horizonDays / 30)).toFixed(1);
  const expectedDetainedPerIncident = firstMonthIncidents > 0 ? +(firstMonthDetained / firstMonthIncidents).toFixed(1) : 0;

  // Type prediction
  const smuggling = valid.filter((i) => i.incident_type === "تهريب");
  const infiltration = valid.filter((i) => i.incident_type === "تسلل");
  const predictedType = smuggling.length >= infiltration.length ? "تهريب" : "تسلل";

  return {
    dataEndpoint: {
      lastDate: dataEndDate, lastDateLabel: fmtDate(dataEndDate), firstDateLabel: fmtDate(dataStartDate),
      totalRecords: valid.length, daysSpanned: totalDays,
    },
    forecastWindow: {
      start: forecastStart, end: forecastEnd, days: horizonDays,
      startLabel: fmtDate(forecastStart), endLabel: fmtDate(forecastEnd),
    },
    model: {
      pipelineModel: model_name, source: "MLOps Pipeline (ViEWS)",
      monthlyRate: +firstMonthIncidents.toFixed(2), dailyRate: +dailyRate.toFixed(3),
      trendFactor: 1, recentDailyRate: +dailyRate.toFixed(3), overallDailyRate: +(valid.length / totalDays).toFixed(3),
    },
    when: {
      totalExpectedIncidents: totalExpected,
      peakDay: { date: peak.date, label: fmtDate(peak.date), expected: peak.expected },
      dailyBreakdown: dailyForecast,
    },
    where: {
      governorate: topGov, location: topLoc?.location_name || null,
      riskScore: ranking[0] ? ranking[0].score : 0, ranking: ranking.slice(0, 5),
    },
    howMany: {
      predictedType, expectedTotalDetained, expectedDetainedPerIncident,
    },
    reasoning: {
      endpoint: `تنتهي البيانات عند آخر سجل في ${fmtDate(dataEndDate)} — التنبؤ يبدأ من اليوم التالي ويمتد ${horizonDays} يوماً`,
      rate: `أنبوب MLOps (نموذج ${model_name}) ينتج ${firstMonthIncidents.toFixed(1)} حادث في الشهر الأول المتوقع (${dailyRate.toFixed(2)} حادث/يوم)`,
      seasonal: `التنبؤ الشهري من الأنبوب يوزع على الإطار اليومي للفئة التكتيكية`,
      spatial: `${topGov} هي الأعلى مخاطر بناءً على توقعات الأنبوب على مستوى المحافظة للشهر الأول`,
      typeReason: `بناءً على التوزيع التاريخي، ${predictedType} هو الأكثر شيوعاً (${predictedType === "تهريب" ? smuggling.length : infiltration.length} من ${valid.length} حادث)`,
    },
    pipeline: { incResult, detResult },
  };
}