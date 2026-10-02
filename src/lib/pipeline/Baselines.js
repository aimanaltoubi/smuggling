/**
 * views-baseline — JS port of the VIEWS baseline models.
 *
 * These are the baselines that CAN run in the browser (pure computation, no
 * native ML libraries): ZeroModel, LocfModel, AverageModel, ConflictologyModel,
 * MixtureBaseline. The stepshift ML models (RandomForest, LightGBM, XGBoost,
 * Hurdle) run in the Python reference only — see ModelCatalog for availability.
 *
 * All operate on panel data (month_id, entity_id) with a causal split
 * (train_end = test_start - 1, no leakage). Point forecasts return y_pred as
 * a number per (entity, month); distributional models return n_samples draws.
 *
 * Reference: https://github.com/views-platform/views-baseline
 */

import { rowsToPanel, panelByEntity, panelEntities } from "./PanelBuilder";

/**
 * @typedef {Object} PredictionFrame
 * @property {number[]} time        — month_id per row
 * @property {(string|number)[]} unit — entity_id per row
 * @property {number[][]} y_pred    — (N, 1) for point, (N, n_samples) for distributional
 * @property {string} level
 * @property {string} target
 */

function makeFrame(yPred, time, unit, level, target) {
  return { y_pred: yPred, time, unit, level, target };
}

function unitsWithHistory(panel, target, trainEnd) {
  const byEnt = panelByEntity(panel);
  const units = [];
  for (const [ent, arr] of byEnt) {
    if (arr.some((c) => c.month_id <= trainEnd && c[target] != null)) units.push(ent);
  }
  return units.sort();
}

function rng(seed) {
  // mulberry32 — deterministic PRNG so distributional models are reproducible
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===========================================================================
// ZeroModel — predicts exactly 0
// ===========================================================================
export class ZeroModel {
  constructor({ targets, partition, loa }) {
    this.targets = targets; this.partition = partition; this.loa = loa;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    this._units = panelEntities(panel);
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const m of months) for (const u of this._units) { time.push(m); unit.push(u); y.push([0]); }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// LocfModel — Last Observation Carried Forward
// ===========================================================================
export class LocfModel {
  constructor({ targets, partition, loa }) {
    this.targets = targets; this.partition = partition; this.loa = loa;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const last = {};
    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (past.length) last[ent] = past[past.length - 1][this.targets[0]] || 0;
    }
    this._units = Object.keys(last).sort();
    this._last = last;
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const m of months) for (const u of this._units) { time.push(m); unit.push(u); y.push([this._last[u] || 0]); }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// AverageModel — arithmetic mean of the unit's last window_months, held constant
// ===========================================================================
export class AverageModel {
  constructor({ targets, windowMonths, partition, loa }) {
    this.targets = targets; this.windowMonths = windowMonths; this.partition = partition; this.loa = loa;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const means = {};
    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (!past.length) continue;
      const window = past.slice(-this.windowMonths);
      means[ent] = window.reduce((s, c) => s + (c[this.targets[0]] || 0), 0) / window.length;
    }
    this._units = Object.keys(means).sort();
    this._means = means;
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const m of months) for (const u of this._units) { time.push(m); unit.push(u); y.push([this._means[u] || 0]); }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// ConflictologyModel — empirical climatology (bootstrap resample of unit window)
// ===========================================================================
export class ConflictologyModel {
  constructor({ targets, windowMonths, partition, loa, nSamples = 100, seed = 42 }) {
    this.targets = targets; this.windowMonths = windowMonths; this.partition = partition;
    this.loa = loa; this.nSamples = nSamples; this.seed = seed;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const histories = {};
    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (past.length) histories[ent] = past.slice(-this.windowMonths).map((c) => c[this.targets[0]] || 0);
    }
    this._units = Object.keys(histories).sort();
    this._histories = histories;
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const r = rng(this.seed);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const u of this._units) {
        const hist = this._histories[u] || [0];
        for (const m of months) {
          const draw = [];
          for (let s = 0; s < this.nSamples; s++) draw.push(hist[Math.floor(r() * hist.length)]);
          time.push(m); unit.push(u); y.push(draw);
        }
      }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// MixtureBaseline — mixture of local (unit window) + global (all positive) pools
// ===========================================================================
export class MixtureBaseline {
  constructor({ targets, windowMonths, lambdaMix, nSamples = 100, partition, loa, seed = 42 }) {
    this.targets = targets; this.windowMonths = windowMonths; this.lambdaMix = lambdaMix;
    this.nSamples = nSamples; this.partition = partition; this.loa = loa; this.seed = seed;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const local = {};
    const globalPool = [];
    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (past.length) {
        local[ent] = past.slice(-this.windowMonths).map((c) => c[this.targets[0]] || 0);
        for (const c of past) {
          const v = c[this.targets[0]] || 0;
          if (v > 0) globalPool.push(v);
        }
      }
    }
    this._units = Object.keys(local).sort();
    this._local = local;
    this._global = globalPool.length ? globalPool : [0];
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const r = rng(this.seed);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const u of this._units) {
        const loc = this._local[u] || [0];
        for (const m of months) {
          const draw = [];
          for (let s = 0; s < this.nSamples; s++) {
            if (r() < this.lambdaMix) draw.push(this._global[Math.floor(r() * this._global.length)]);
            else draw.push(loc[Math.floor(r() * loc.length)]);
          }
          time.push(m); unit.push(u); y.push(draw);
        }
      }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

/**
 * Convert a PredictionFrame to the pipeline's projection list format.
 */
export function frameToProjections(frames) {
  const projections = [];
  for (const [tgt, pf] of Object.entries(frames)) {
    for (let i = 0; i < pf.time.length; i++) {
      const row = pf.y_pred[i];
      let val, ciLower, ciUpper;
      if (Array.isArray(row) && row.length > 1) {
        // distributional
        const sorted = [...row].sort((a, b) => a - b);
        val = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        ciLower = sorted[Math.floor(sorted.length * 0.1)] || 0;
        ciUpper = sorted[Math.floor(sorted.length * 0.9)] || 0;
      } else {
        val = Array.isArray(row) ? row[0] : row;
        ciLower = val * 0.8;
        ciUpper = val * 1.2;
      }
      val = Math.max(0, val);
      projections.push({
        month_id: pf.time[i],
        entity_id: String(pf.unit[i]),
        value: +val.toFixed(3),
        ci_lower: +Math.max(0, ciLower).toFixed(3),
        ci_upper: +ciUpper.toFixed(3),
      });
    }
  }
  return projections;
}