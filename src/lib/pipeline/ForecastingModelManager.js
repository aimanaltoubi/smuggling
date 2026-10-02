/**
 * ForecastingModelManager — thin façade that routes to pipeline stages.
 * Each stage receives a frozen context object (ADR-045 decomposition).
 */

import ModelPathManager from "./ModelPathManager";
import TrainingStage from "./TrainingStage";
import EvaluationStage from "./EvaluationStage";
import ForecastingStage from "./ForecastingStage";
import ReportingStage from "./ReportingStage";
import ModelValidator from "./ModelValidator";

function makeCtx(config, data, runId) {
  const rid = runId || "run_001";
  const pathManager = new ModelPathManager(config.model_name, config.deployment.artifact_root || "artifacts");
  return Object.freeze({ config, data, paths: pathManager.resolve(rid), run_id: rid });
}

export default class ForecastingModelManager {
  constructor(config) {
    this.config = config;
    this.validator = new ModelValidator();
    this.training = new TrainingStage();
    this.evaluation = new EvaluationStage();
    this.forecasting = new ForecastingStage();
    this.reporting = new ReportingStage();
  }

  run(data, runId = null, { train = true, evaluate = true, forecast = true, report = true } = {}) {
    this.validator.validateConfig(this.config);
    const results = { run_id: runId || "run_001", stages: [] };

    if (train) { results.train = this.training.execute(makeCtx(this.config, data, runId)); results.stages.push("train"); }
    if (evaluate) { results.evaluate = this.evaluation.execute(makeCtx(this.config, data, runId), results.train); results.stages.push("evaluate"); }
    if (forecast) { results.forecast = this.forecasting.execute(makeCtx(this.config, data, runId), results.train); results.stages.push("forecast"); }
    if (report) { results.report = this.reporting.execute(makeCtx(this.config, data, runId), results); results.stages.push("report"); }

    return results;
  }

  trainOnly(data, runId) { return this.training.execute(makeCtx(this.config, data, runId)); }
  evaluateOnly(data, trainOutput, runId) { return this.evaluation.execute(makeCtx(this.config, data, runId), trainOutput); }
  forecastOnly(data, trainOutput, runId) { return this.forecasting.execute(makeCtx(this.config, data, runId), trainOutput); }
  reportOnly(data, runResults, runId) { return this.reporting.execute(makeCtx(this.config, data, runId), runResults); }
}