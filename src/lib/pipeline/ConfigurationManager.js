/**
 * ConfigurationManager — merges layered configuration into a frozen view.
 *
 * Layers (lowest → highest priority):
 *   1. deployment   — runtime environment, paths, io backends
 *   2. hyperparameters — model-specific tuning knobs
 *   3. meta — model name, level (priogrid/governorate), target
 *   4. partitions — train / calibration / validation / forecast month ranges
 *   5. runtime overrides — CLI flags, highest priority
 */

const DEFAULT_DEPLOYMENT = {
  io_backend: "local",
  artifact_root: "artifacts",
  log_dir: "logs",
  wandb_enabled: false,
};

const DEFAULT_HYPERPARAMETERS = {
  forecasting: { horizon_months: 48, seasonal_periods: 12, alpha: 0.4, beta: 0.1, gamma: 0.2 },
  prediction: { horizon_days: 14 },
};

function deepMerge(base, overlay) {
  const result = { ...base };
  for (const [k, v] of Object.entries(overlay || {})) {
    if (k in result && typeof result[k] === "object" && !Array.isArray(result[k]) && typeof v === "object" && !Array.isArray(v)) {
      result[k] = deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export default class ConfigurationManager {
  constructor(meta = {}, partitions = {}) {
    this._deployment = { ...DEFAULT_DEPLOYMENT };
    this._hyperparameters = { ...DEFAULT_HYPERPARAMETERS };
    this._meta = { ...meta };
    this._partitions = { ...partitions };
    this._overrides = {};
  }

  withDeployment(d) { this._deployment = deepMerge(this._deployment, d); return this; }
  withHyperparameters(hp) { this._hyperparameters = deepMerge(this._hyperparameters, hp); return this; }
  withOverrides(o) { this._overrides = deepMerge(this._overrides, o); return this; }

  overrideTimestep(monthId) {
    this._overrides = deepMerge(this._overrides, { partitions: { forecast_start: monthId } });
    return this;
  }

  build() {
    const hp = deepMerge(this._hyperparameters, this._overrides.hyperparameters || {});
    const meta = deepMerge(this._meta, this._overrides.meta || {});
    const deployment = deepMerge(this._deployment, this._overrides.deployment || {});
    const partitions = deepMerge(this._partitions, this._overrides.partitions || {});

    this._validatePartitions(partitions);

    const target = meta.target;
    if (!target) throw new Error("Configuration error: 'target' must be specified in meta");
    const level = meta.level || "governorate";
    if (!["priogrid", "governorate"].includes(level))
      throw new Error(`Configuration error: level must be 'priogrid' or 'governorate', got ${level}`);

    return Object.freeze({
      deployment,
      hyperparameters: hp,
      meta,
      partitions: Object.freeze({ ...partitions }),
      runtime_overrides: this._overrides,
      target,
      level,
      model_name: meta.model_name || "oman_border_default",
    });
  }

  _validatePartitions(p) {
    const required = ["train_start", "train_end", "calibration_start", "calibration_end",
      "validation_start", "validation_end", "forecast_start", "forecast_end"];
    const missing = required.filter((k) => !(k in p));
    if (missing.length) throw new Error(`Configuration error: partitions missing keys: ${missing.join(", ")}`);
    if (p.train_start > p.train_end) throw new Error("Configuration error: train_start > train_end");
    if (p.forecast_start <= p.validation_end)
      throw new Error("Configuration error: forecast_start must follow validation_end");
  }
}