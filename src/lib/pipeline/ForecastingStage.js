/**
 * ForecastingStage — post-processing, validation, and persistence of forecast
 * predictions for the future horizon.
 */

import { prepareMonthlySeries, holtWintersForecast } from "@/lib/analytics/forecasting";

export default class ForecastingStage {
  execute(ctx, trainOutput) {
    const config = ctx.config;
    const target = config.target;
    const trainRows = ctx.data.partitions.train;

    const series = prepareMonthlySeries(trainRows, target);
    const hp = config.hyperparameters.forecasting || {};
    const horizon = hp.horizon_months || 48;

    const fc = holtWintersForecast(series, {
      horizon, alpha: hp.alpha, beta: hp.beta, gamma: hp.gamma,
      seasonalPeriods: hp.seasonal_periods,
    });

    const forecastValues = fc.forecastValues || [];
    const ciLower = fc.ciLower || [];
    const ciUpper = fc.ciUpper || [];
    const months = fc.forecastMonths || [];

    const projections = forecastValues.map((val, i) => {
      const clamped = Math.max(0, val);
      return {
        month_id: months[i] || null,
        entity_id: "all",
        value: +clamped.toFixed(3),
        ci_lower: +Math.max(0, ciLower[i] ?? clamped).toFixed(3),
        ci_upper: +(ciUpper[i] ?? clamped).toFixed(3),
      };
    });

    const validated = this._validate(projections);

    return Object.freeze({ projections, horizon_months: horizon, target, level: config.level, validated });
  }

  _validate(projections) {
    for (const p of projections) {
      if (Number.isNaN(p.value) || !Number.isFinite(p.value) || p.value < 0) return false;
    }
    return true;
  }
}