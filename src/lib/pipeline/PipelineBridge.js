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
import TacticalForecast from '@/lib/pipeline/TacticalForecast';
import { toMonthId, monthIdToDate } from "./ViewsDataLoader";
import { buildMonthlyObservationSeries } from "../analytics/reportEvidence";

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
  return buildMonthlyObservationSeries(incidents).map(month => {
    const monthId = toMonthId(`${month.label}-01T00:00:00Z`);
    return { month_id: monthId, period: month.label, date: monthIdToDate(monthId), incidents: month.incidents, detained: month.detained };
  });
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

// A final month observed only partway (e.g. data ending 1 September) would be
// read as a collapse in activity, so it is withheld and forecast instead.
export function withholdIncompleteFinalMonth(incidents, observedThrough = null) {
  let endMs = observedThrough ? Date.parse(observedThrough) : NaN;
  if (!Number.isFinite(endMs)) {
    endMs = -Infinity;
    for (const r of incidents) { const t = Date.parse(r.incident_date); if (t > endMs) endMs = t; }
  }
  if (!Number.isFinite(endMs)) return { incidents, observedThrough: null, partialMonth: null };
  const end = new Date(endMs);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (end.getUTCDate() >= lastDay) return { incidents, observedThrough: end, partialMonth: null };
  const cutoff = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  const complete = incidents.filter(r => Date.parse(r.incident_date) < cutoff);
  if (!complete.length) return { incidents, observedThrough: end, partialMonth: null };
  return {
    incidents: complete,
    observedThrough: end,
    partialMonth: { period: end.toISOString().slice(0, 7), excludedRecords: incidents.length - complete.length },
  };
}

/**
 * Strategic seasonal forecast — runs the MLOps pipeline and returns a
 * TypeForecast-compatible result: historical monthly series + multi-month
 * projection with confidence intervals.
 */
export function pipelineStrategicForecast(allIncidents, opts = {}) {
  const { target = "incidents", level = "governorate", horizon = 48, model_name = "AutoTunedModel", observedThrough = null } = opts;
  const pipelineTarget = target === "detained" ? "detained_count" : "incidents";
  const coverage = withholdIncompleteFinalMonth(allIncidents, observedThrough);
  const incidents = coverage.incidents;

  const result = runPipeline(incidents, {
    model_name, target: pipelineTarget, level, horizon_months: horizon,
    train: true, evaluate: true, forecast: true, report: false,
  });

  const historical = buildHistoricalMonthly(incidents, target);
  const projection = aggregateByMonth(result.forecast?.projections || []).map((p, i) => {
    if (model_name !== 'AutoTunedModel') return p;
    const radius = result.forecast?.selection?.radii?.[i + 1];
    return { ...p, lower95: radius == null ? null : Math.max(0, p.value - radius), upper95: radius == null ? null : p.value + radius };
  });

  return {
    historical,
    projection,
    params: { model: model_name, family: result.train?.artifact?.model_family, target: pipelineTarget, level, selection: result.forecast?.selection, validatedHorizon: 6 },
    residStd: result.evaluate?.ts_metrics?.overall_rmse || 0,
    metrics: result.evaluate?.ts_metrics || {},
    reconciliation: result.forecast?.reconciliation || null,
    observedThrough: coverage.observedThrough,
    partialMonth: coverage.partialMonth,
    provenance: { model_name, target: pipelineTarget, level, stages: result.stages, run_id: result.run_id },
  };
}

/**
 * Tactical next-event prediction — runs the MLOps pipeline for both targets
 * (incidents + detained) at governorate level and derives a daily prediction
 * in the shape PredictionSection and IncidentMap expect.
 */
export function pipelineTacticalPrediction(incidents, opts = {}) {
  return TacticalForecast(incidents, opts);
}