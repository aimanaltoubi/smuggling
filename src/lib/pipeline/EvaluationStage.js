/**
 * EvaluationStage — metrics orchestration (step-wise, month-wise, time-series).
 *
 * Evaluates the SAME model that TrainingStage trains (from ModelCatalog) on the
 * validation partition — no external Holt-Winters dependency. The pipeline is
 * self-contained: train → evaluate → forecast all use the same model family.
 *
 * JS mirror of python_reference/pipeline/stages/evaluation_stage.py.
 */

import { getModel, MODEL_REGISTRY } from "./ModelCatalog";
import { rowsToPanel } from "./PanelBuilder";

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
    const trainRows = [...ctx.data.partitions.train, ...ctx.data.partitions.calibration];
    const target = config.target;
    const level = config.level;
    const loa = level === "priogrid" ? "pgm" : "cm";
    const conflictType = inferConflictType(target);

    // Build validation actuals: total per month across entities
    const valPanel = rowsToPanel(valRows, target, level);
    const valByMonth = new Map();
    for (const c of valPanel.cells) {
      valByMonth.set(c.month_id, (valByMonth.get(c.month_id) || 0) + (c[target] || 0));
    }
    const valMonths = [...valByMonth.keys()].sort((a, b) => a - b);
    const actuals = valMonths.map((m) => valByMonth.get(m));

    // Instantiate the same model for the validation period
    const partitions = config.partitions;
    const evalPartition = {
      test_start: partitions.validation_start,
      output_length: valMonths.length || 12,
    };
    const modelName = config.model_name || "AverageModel";
    const hp = config.hyperparameters.model || {};
    const info = MODEL_REGISTRY[modelName];

    let model;
    if (info && info.available) {
      model = getModel(modelName, target, evalPartition, loa, hp);
    } else {
      model = getModel("AverageModel", target, evalPartition, loa, { window_months: 12 });
    }
    const trainPanel = rowsToPanel(trainRows, target, level);
    model.fit(trainPanel);

    // Predict and aggregate per month across entities
    const predFrames = model.predict(trainPanel, 0);
    const predByMonth = new Map();
    for (const [, pf] of Object.entries(predFrames)) {
      for (let i = 0; i < pf.time.length; i++) {
        const m = pf.time[i];
        const row = pf.y_pred[i];
        const val = Array.isArray(row) ? row.reduce((s, v) => s + v, 0) / row.length : row;
        predByMonth.set(m, (predByMonth.get(m) || 0) + val);
      }
    }
    const preds = valMonths.map((m) => predByMonth.get(m) || 0);

    // Metrics
    const n = Math.min(preds.length, actuals.length);
    const stepMetrics = {};
    for (let step = 1; step <= n; step++) {
      stepMetrics[step] = {
        mae: +mae(preds.slice(0, step), actuals.slice(0, step)).toFixed(4),
        rmse: +rmse(preds.slice(0, step), actuals.slice(0, step)).toFixed(4),
      };
    }
    const monthMetrics = {};
    for (let i = 0; i < n; i++) {
      monthMetrics[valMonths[i]] = {
        mae: +Math.abs(preds[i] - actuals[i]).toFixed(4),
        rmse: +((preds[i] - actuals[i]) ** 2).toFixed(4),
      };
    }
    const tsMetrics = {
      overall_mae: +mae(preds, actuals).toFixed(4),
      overall_rmse: +rmse(preds, actuals).toFixed(4),
      n_eval_points: n,
    };
    const evalPredictions = [];
    for (let i = 0; i < n; i++) {
      evalPredictions.push({ month_id: valMonths[i], predicted: +preds[i].toFixed(3), actual: +actuals[i].toFixed(3) });
    }

    return Object.freeze({
      step_metrics: stepMetrics, month_metrics: monthMetrics,
      ts_metrics: tsMetrics, conflict_type: conflictType, eval_predictions: evalPredictions,
    });
  }
}