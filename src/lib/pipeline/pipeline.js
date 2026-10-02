/**
 * Pipeline entry point — wires ConfigurationManager → ViewsDataLoader →
 * ForecastingModelManager (thin façade) → stages → reconciliation → reporting.
 * JS mirror of python_reference/pipeline/pipeline.py.
 */

import ConfigurationManager from "./ConfigurationManager";
import ViewsDataLoader, { toMonthId } from "./ViewsDataLoader";
import ForecastingModelManager from "./ForecastingModelManager";
import EnsembleManager, { EnsembleSpec } from "./EnsembleManager";

export function defaultPartitions(records) {
  if (!records.length) throw new Error("no records to derive partitions from");
  const mids = records
    .filter((r) => r.incident_date)
    .map((r) => toMonthId(r.incident_date))
    .sort((a, b) => a - b);
  const first = mids[0];
  const last = mids[mids.length - 1];
  const span = last - first;
  const calStart = first + Math.floor(span * 0.6);
  const valStart = first + Math.floor(span * 0.8);
  return {
    train_start: first, train_end: calStart - 1,
    calibration_start: calStart, calibration_end: valStart - 1,
    validation_start: valStart, validation_end: last,
    forecast_start: last + 1, forecast_end: last + 48,
  };
}

export function runPipeline(records, opts = {}) {
  const {
    model_name = "AverageModel",
    target = "detained_count",
    level = "governorate",
    horizon_months = 36,
    train = true, evaluate = true, forecast = true, report = true,
    reference = null,
  } = opts;

  const partitions = defaultPartitions(records);
  const config = new ConfigurationManager(
    { model_name, target, level }, partitions
  ).withHyperparameters({ forecasting: { horizon_months } }).build();

  const loader = new ViewsDataLoader();
  const data = loader.load(records, config.partitions, level, reference);

  const manager = new ForecastingModelManager(config);
  return manager.run(data, null, { train, evaluate, forecast, report });
}

export function runEnsemble(records, spec, opts = {}) {
  const { target = "detained_count", level = "governorate" } = opts;
  const memberResults = spec.members.map((member) =>
    runPipeline(records, { model_name: member, target, level, train: true, evaluate: true, forecast: true, report: false })
  );
  const memberForecasts = memberResults.map((r) => ({ projections: r.forecast.projections }));
  const memberRmse = memberResults.map((r) => {
    const ts = r.evaluate?.ts_metrics || {};
    return ts.overall_rmse != null && !Number.isNaN(ts.overall_rmse) ? ts.overall_rmse : null;
  });

  const ensembleMgr = new EnsembleManager(spec);
  return ensembleMgr.aggregate(memberForecasts, memberRmse);
}