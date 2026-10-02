/**
 * TrainingStage — fits the forecasting model and creates a training log.
 *
 * Uses the VIEWS-compatible ModelCatalog. In the browser, only the baselines
 * (pure computation) are available; stepshift ML models run in the Python
 * reference. The fitted model object is the artifact.
 *
 * JS mirror of python_reference/pipeline/stages/training_stage.py.
 */

import { getModel, MODEL_REGISTRY } from "./ModelCatalog";
import { rowsToPanel } from "./PanelBuilder";

export default class TrainingStage {
  execute(ctx) {
    const trainRows = ctx.data.partitions.train;
    const config = ctx.config;
    const target = config.target;
    const level = config.level;
    const loa = level === "priogrid" ? "pgm" : "cm";

    const panel = rowsToPanel(trainRows, target, level);

    const partitions = config.partitions;
    const modelPartition = {
      test_start: partitions.forecast_start,
      output_length: (config.hyperparameters.forecasting || {}).horizon_months || 36,
    };

    const modelName = config.model_name || "AverageModel";
    const hp = config.hyperparameters.model || {};
    const info = MODEL_REGISTRY[modelName];

    let model, modelFamily;
    if (info && info.available) {
      model = getModel(modelName, target, modelPartition, loa, hp);
      modelFamily = info.family;
      model.fit(panel);
    } else {
      // stepshifter not available in-browser — fall back to AverageModel for live preview
      modelFamily = "baseline (preview)";
      model = getModel("AverageModel", target, modelPartition, loa, { window_months: 12 });
      model.fit(panel);
    }

    const artifact = {
      model_name: modelName,
      model_available_in_browser: !!(info && info.available),
      target,
      level,
      loa,
      hyperparameters: hp,
      n_train_points: panel.cells.length,
      n_entities: new Set(panel.cells.map((c) => c.entity_id)).size,
      model_family: modelFamily,
    };

    const trainingLog = {
      model_name: modelName,
      run_id: ctx.run_id,
      target,
      level,
      n_train_points: panel.cells.length,
      n_entities: new Set(panel.cells.map((c) => c.entity_id)).size,
      hyperparameters: hp,
      stages_run: ["train"],
      wandb_alert: "stubbed (browser)",
      note: info && !info.available
        ? `'${modelName}' runs in the Python reference only; live preview uses AverageModel.`
        : undefined,
    };

    return Object.freeze({ model, model_name: modelName, artifact, fitted_values: [], training_log: trainingLog });
  }
}