/**
 * TrainingStage — fits the forecasting model and creates a training log.
 * Uses the dependency-free Holt-Winters from analytics/forecasting.js.
 */

import { prepareMonthlySeries, holtWintersForecast } from "@/lib/analytics/forecasting";

export default class TrainingStage {
  execute(ctx) {
    const trainRows = ctx.data.partitions.train;
    const config = ctx.config;
    const target = config.target;

    const series = prepareMonthlySeries(trainRows, target);
    const hp = config.hyperparameters.forecasting || {};
    const horizon = hp.horizon_months || 48;

    const fc = holtWintersForecast(series, {
      horizon, alpha: hp.alpha, beta: hp.beta, gamma: hp.gamma,
      seasonalPeriods: hp.seasonal_periods,
    });

    const artifact = {
      model_name: config.model_name,
      target,
      level: config.level,
      hyperparameters: hp,
      fitted_state: fc.modelState || {},
      n_train_points: series.length,
    };

    const fittedValues = (fc.fittedMonths || []).map((m, i) => ({
      month_id: m, fitted: fc.fittedValues[i],
    }));

    const trainingLog = {
      model_name: config.model_name,
      run_id: ctx.run_id,
      target,
      level: config.level,
      n_train_points: series.length,
      hyperparameters: hp,
      stages_run: ["train"],
      wandb_alert: "stubbed (browser)",
    };

    return Object.freeze({ artifact, fitted_values: fittedValues, training_log: trainingLog });
  }
}