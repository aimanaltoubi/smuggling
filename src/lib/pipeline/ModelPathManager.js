/**
 * ModelPathManager — path + artifact resolution for a single model.
 * Canonical location: data/ (relocated per ADR-045).
 */

export default class ModelPathManager {
  constructor(modelName, artifactRoot = "artifacts") {
    this.modelName = modelName;
    this.artifactRoot = artifactRoot;
  }

  resolve(runId = "latest") {
    const base = `${this.artifactRoot}/${this.modelName}/${runId}`;
    return Object.freeze({
      model_dir: base,
      artifact_path: `${base}/model.json`,
      training_log_path: `${base}/training_log.json`,
      evaluation_path: `${base}/evaluation.json`,
      forecast_path: `${base}/forecast.json`,
      report_path: `${base}/report.html`,
      config_path: `${base}/config.json`,
    });
  }

  listRuns() {
    // In-browser: return empty (no filesystem). Python side has real impl.
    return [];
  }
}