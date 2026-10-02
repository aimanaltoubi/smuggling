/**
 * EvaluationStage — metrics orchestration (step-wise, month-wise, time-series).
 * Conflict type auto-inferred from target tokens (sb / ns / os).
 */

import { prepareMonthlySeries, holtWintersForecast } from "@/lib/analytics/forecasting";

function inferConflictType(target) {
  const t = (target || "").toLowerCase();
  if (t.includes("sb") || t.includes("تهريب")) return "تهريب";
  if (t.includes("ns") || t.includes("تسلل")) return "تسلل";
  return "all";
}

function mae(pred, actual) {
  const n = Math.min(pred.length, actual.length);
  if (!n) return NaN;
  let s = 0; for (let i = 0; i < n; i++) s += Math.abs(pred[i] - actual[i]);
  return s / n;
}
function rmse(pred, actual) {
  const n = Math.min(pred.length, actual.length);
  if (!n) return NaN;
  let s = 0; for (let i = 0; i < n; i++) s += (pred[i] - actual[i]) ** 2;
  return Math.sqrt(s / n);
}

export default class EvaluationStage {
  execute(ctx, trainOutput) {
    const config = ctx.config;
    const valRows = ctx.data.partitions.validation;
    const target = config.target;
    const conflictType = inferConflictType(target);

    const valSeries = prepareMonthlySeries(valRows, target);
    const trainRows = ctx.data.partitions.train;
    const trainSeries = prepareMonthlySeries(trainRows, target);

    const hp = config.hyperparameters.forecasting || {};
    const horizon = valSeries.length || hp.horizon_months || 12;

    const fc = holtWintersForecast(trainSeries, {
      horizon, alpha: hp.alpha, beta: hp.beta, gamma: hp.gamma,
      seasonalPeriods: hp.seasonal_periods,
    });
    const preds = fc.forecastValues || [];
    const actuals = valSeries.map(([, v]) => v);

    const stepMetrics = {};
    for (let step = 1; step <= Math.min(preds.length, actuals.length); step++) {
      stepMetrics[step] = { mae: +mae(preds.slice(0, step), actuals.slice(0, step)).toFixed(4),
                            rmse: +rmse(preds.slice(0, step), actuals.slice(0, step)).toFixed(4) };
    }

    const monthMetrics = {};
    const valMonths = valSeries.map(([m]) => m);
    for (let i = 0; i < valMonths.length && i < preds.length; i++) {
      monthMetrics[valMonths[i]] = { mae: +Math.abs(preds[i] - actuals[i]).toFixed(4),
                                      rmse: +((preds[i] - actuals[i]) ** 2).toFixed(4) };
    }

    const tsMetrics = {
      overall_mae: +mae(preds, actuals).toFixed(4),
      overall_rmse: +rmse(preds, actuals).toFixed(4),
      n_eval_points: Math.min(preds.length, actuals.length),
    };

    const evalPredictions = [];
    for (let i = 0; i < Math.min(preds.length, actuals.length); i++) {
      evalPredictions.push({ month_id: valMonths[i] || null, predicted: preds[i], actual: actuals[i] });
    }

    return Object.freeze({ step_metrics: stepMetrics, month_metrics: monthMetrics,
      ts_metrics: tsMetrics, conflict_type: conflictType, eval_predictions: evalPredictions });
  }
}