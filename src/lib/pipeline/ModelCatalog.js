/**
 * ModelCatalog — factory for VIEWS-compatible models.
 *
 * JS mirror of python_reference/models/catalog.py. In the browser, only the
 * baselines (pure computation) are available. The stepshift ML models
 * (RandomForest, LightGBM, XGBoost, Hurdle) require native Python libraries
 * and run in the Python reference only — they are listed here so the UI can
 * show the full VIEWS model catalog and mark their availability.
 *
 * Reference: https://github.com/views-platform/views-models
 */

import { ZeroModel, LocfModel, AverageModel, ConflictologyModel, MixtureBaseline, SeasonalClimatologyModel, TrendSeasonalModel } from "./Baselines";

export const MODEL_REGISTRY = {
  // --- baselines (views-baseline) — available in-browser ---
  ZeroModel:                   { family: "baseline", available: true,  needsPython: false },
  LocfModel:                   { family: "baseline", available: true,  needsPython: false },
  AverageModel:                { family: "baseline", available: true,  needsPython: false },
  ConflictologyModel:          { family: "baseline", available: true,  needsPython: false },
  MixtureBaseline:             { family: "baseline", available: true,  needsPython: false },
  SeasonalClimatologyModel:     { family: "baseline", available: true,  needsPython: false },
  TrendSeasonalModel:           { family: "baseline", available: true,  needsPython: false },
  ParametricConflictology:     { family: "baseline", available: false, needsPython: true },
  ParametricHurdleConflictology: { family: "baseline", available: false, needsPython: true },
  // --- stepshifters (views-stepshifter) — Python only (Darts/sklearn/lightgbm/xgboost) ---
  LinearRegressionStepshifter: { family: "stepshifter", available: false, needsPython: true },
  RandomForestStepshifter:     { family: "stepshifter", available: false, needsPython: true },
  LightGBMStepshifter:         { family: "stepshifter", available: false, needsPython: true },
  XGBoostStepshifter:          { family: "stepshifter", available: false, needsPython: true },
  HurdleModel:                 { family: "stepshifter", available: false, needsPython: true },
};

export const ENSEMBLES = {
  cruel_summer:  ["RandomForestStepshifter", "LightGBMStepshifter", "AverageModel"],
  first_love:    ["LinearRegressionStepshifter", "RandomForestStepshifter", "LocfModel"],
  pink_ponyclub: ["LightGBMStepshifter", "XGBoostStepshifter", "ConflictologyModel"],
  rude_boy:      ["XGBoostStepshifter", "RandomForestStepshifter", "MixtureBaseline"],
  skinny_love:   ["LinearRegressionStepshifter", "LightGBMStepshifter", "AverageModel"],
  white_mustang: ["RandomForestStepshifter", "XGBoostStepshifter", "ParametricHurdleConflictology"],
};

export function listModels() {
  return Object.keys(MODEL_REGISTRY);
}

export function availableModels() {
  return Object.entries(MODEL_REGISTRY).filter(([, v]) => v.available).map(([k]) => k);
}

export function modelFamilies() {
  const out = {};
  for (const [name, info] of Object.entries(MODEL_REGISTRY)) {
    (out[info.family] = out[info.family] || []).push(name);
  }
  return out;
}

/**
 * Instantiate a baseline model by name (stepshifters throw — Python only).
 */
export function getModel(name, target, partition, loa = "pgm", hp = {}) {
  const info = MODEL_REGISTRY[name];
  if (!info) throw new Error(`Unknown model '${name}'. Available: ${listModels().join(", ")}`);
  if (!info.available) {
    throw new Error(
      `Model '${name}' runs in the Python reference only (needs ${info.needsPython ? "native ML libraries" : "scipy"}). ` +
      `Use a browser-available baseline for live preview, or run the Python pipeline for full forecasts.`
    );
  }
  const targets = [target];
  switch (name) {
    case "ZeroModel": return new ZeroModel({ targets, partition, loa });
    case "LocfModel": return new LocfModel({ targets, partition, loa });
    case "AverageModel": return new AverageModel({ targets, windowMonths: hp.window_months || 12, partition, loa });
    case "ConflictologyModel": return new ConflictologyModel({ targets, windowMonths: hp.window_months || 24, partition, loa, nSamples: hp.n_samples || 100, seed: hp.seed || 42 });
    case "MixtureBaseline": return new MixtureBaseline({ targets, windowMonths: hp.window_months || 24, lambdaMix: hp.lambda_mix ?? 0.3, nSamples: hp.n_samples || 100, partition, loa, seed: hp.seed || 42 });
    case "SeasonalClimatologyModel": return new SeasonalClimatologyModel({ targets, windowMonths: hp.window_months || 36, partition, loa });
    case "TrendSeasonalModel": return new TrendSeasonalModel({ targets, windowMonths: hp.window_months || 36, partition, loa, momentumWeight: hp.momentum_weight ?? 0.4 });
    default: throw new Error(`Model '${name}' not yet implemented in JS`);
  }
}