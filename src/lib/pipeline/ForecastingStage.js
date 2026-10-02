/**
 * ForecastingStage — post-processing, validation, and persistence of forecast
 * predictions for the future horizon.
 *
 * Takes the trained model (from TrainingStage) and produces future-horizon
 * projections. Converts the model's PredictionFrame output into the pipeline's
 * projection list format.
 *
 * JS mirror of python_reference/pipeline/stages/forecasting_stage.py.
 */

import { rowsToPanel } from "./PanelBuilder";
import { frameToProjections } from "./Baselines";

export default class ForecastingStage {
  execute(ctx, trainOutput) {
    const config = ctx.config;
    const target = config.target;
    const level = config.level;
    const model = trainOutput.model;
    const horizon = (config.hyperparameters.forecasting || {}).horizon_months || 36;

    // build the full panel (train + validation) for feature lags
    const allRows = [...ctx.data.partitions.train, ...ctx.data.partitions.validation];
    const panel = rowsToPanel(allRows, target, level);

    const predFrames = model.predict(panel, 0);
    const projections = frameToProjections(predFrames);
    const validated = this._validate(projections);

    return Object.freeze({
      projections, horizon_months: horizon, target, level,
      model_name: trainOutput.model_name, validated,
    });
  }

  _validate(projections) {
    for (const p of projections) {
      if (Number.isNaN(p.value) || !Number.isFinite(p.value) || p.value < 0) return false;
    }
    return true;
  }
}