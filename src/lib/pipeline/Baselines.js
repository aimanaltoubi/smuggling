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

// ===========================================================================
// SeasonalClimatologyModel — calendar-month climatology (captures seasonality)
// For each entity, computes the mean per calendar month (1-12) from training
// history, then predicts that month's mean for each future month. This produces
// a forecast that varies across months (unlike AverageModel which is flat).
// ===========================================================================
export class SeasonalClimatologyModel {
  constructor({ targets, windowMonths, partition, loa }) {
    this.targets = targets; this.windowMonths = windowMonths || 36; this.partition = partition; this.loa = loa;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }
  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const monthlyMeans = {}; // {entity: [12 values, index 0=Jan]}
    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (!past.length) continue;
      const window = past.slice(-this.windowMonths);
      const sums = new Array(12).fill(0);
      const counts = new Array(12).fill(0);
      for (const c of window) {
        const calMonth = ((c.month_id - 1) % 12); // 0-indexed
        sums[calMonth] += (c[this.targets[0]] || 0);
        counts[calMonth] += 1;
      }
      // fill months with no data using the entity's overall mean
      const overallMean = sums.reduce((s, v) => s + v, 0) / Math.max(1, counts.reduce((s, v) => s + v, 0));
      const means = [];
      for (let i = 0; i < 12; i++) {
        means.push(counts[i] > 0 ? sums[i] / counts[i] : overallMean);
      }
      monthlyMeans[ent] = means;
    }
    this._units = Object.keys(monthlyMeans).sort();
    this._monthlyMeans = monthlyMeans;
    return this;
  }
  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const m of months) {
        const calMonth = ((m - 1) % 12); // 0-indexed
        for (const u of this._units) {
          time.push(m); unit.push(u);
          y.push([this._monthlyMeans[u][calMonth] || 0]);
        }
      }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// TrendSeasonalModel — seasonal climatology × trend factor + momentum blend
//
// Improves on SeasonalClimatologyModel by:
//   1. Detecting year-over-year trend (recent 12mo avg / previous 12mo avg)
//   2. Applying the trend factor to the climatology prediction
// This eliminates the systematic under-prediction bias when data has a trend.
// ===========================================================================
export class TrendSeasonalModel {
  constructor({ targets, windowMonths, partition, loa, momentumWeight = 0.4 }) {
    this.targets = targets;
    this.windowMonths = windowMonths || 36;
    this.partition = partition;
    this.loa = loa;
    this.momentumWeight = momentumWeight;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }

  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const monthlyMeans = {};
    const trendFactors = {};

    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (!past.length) continue;

      const sorted = [...past].sort((a, b) => a.month_id - b.month_id);
      const window = sorted.slice(-this.windowMonths);

      // Calendar-month climatology
      const sums = new Array(12).fill(0);
      const counts = new Array(12).fill(0);
      for (const c of window) {
        const cm = (c.month_id - 1) % 12;
        sums[cm] += c[this.targets[0]] || 0;
        counts[cm] += 1;
      }
      const totalSum = sums.reduce((s, v) => s + v, 0);
      const totalCount = counts.reduce((s, v) => s + v, 0);
      const overallMean = totalSum / Math.max(1, totalCount);
      const means = [];
      for (let i = 0; i < 12; i++) {
        means.push(counts[i] > 0 ? sums[i] / counts[i] : overallMean);
      }
      monthlyMeans[ent] = means;

      // Trend factor: recent 12 months vs previous 12 months
      const recent12 = sorted.slice(-12);
      const previous12 = sorted.slice(-24, -12);
      const recentAvg = recent12.reduce((s, c) => s + (c[this.targets[0]] || 0), 0) / Math.max(1, recent12.length);
      const previousAvg = previous12.length > 0
        ? previous12.reduce((s, c) => s + (c[this.targets[0]] || 0), 0) / previous12.length
        : recentAvg;
      let trend = previousAvg > 0 ? recentAvg / previousAvg : 1;
      trend = Math.max(0.5, Math.min(2.0, trend)); // clamp
      trendFactors[ent] = trend;
    }

    this._units = Object.keys(monthlyMeans).sort();
    this._monthlyMeans = monthlyMeans;
    this._trendFactors = trendFactors;
    return this;
  }

  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (const m of months) {
        const cm = (m - 1) % 12;
        for (const u of this._units) {
          time.push(m); unit.push(u);
          const seasonal = this._monthlyMeans[u][cm] || 0;
          const trend = this._trendFactors[u] || 1;
          y.push([+(seasonal * trend).toFixed(3)]);
        }
      }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

// ===========================================================================
// AdaptiveTrendModel — STL-inspired decomposition + Holt's damped trend
//
// Based on:
//   - Hyndman & Athanasopoulos, "Forecasting: Principles and Practice" (FPP3),
//     Ch 6 (STL decomposition) and Ch 8 (Holt's damped trend).
//   - Gardner & McKenzie (1985) — damping parameter φ prevents over-shooting.
//   - Hegre et al. (2021) ViEWS2020 — adaptive ensemble constituent models.
//
// Method:
//   1. Seasonal component: calendar-month climatology (seasonal-naive, FPP3 §6.6)
//   2. Seasonally-adjust the training series: y_adj = y - seasonal
//   3. Fit Holt's linear trend (level + slope) on y_adj via exponential smoothing
//   4. Apply damping φ to the trend component (prevents over-shoot on upward
//      trends and accelerates convergence on downward trends)
//   5. Recompose: forecast = (level + damped_trend) + seasonal
//
// This fixes the two weaknesses the evaluation found:
//   - Downward trends: the damped slope goes negative, so forecasts decline
//     (unlike TrendSeasonalModel's clamped ratio which floors at 0.5×)
//   - Upward-trend bias: φ < 1 dampens the trend, reducing over-prediction
// ===========================================================================
export class AdaptiveTrendModel {
  constructor({ targets, windowMonths, partition, loa, alpha = 0.3, beta = 0.1, phi = 0.9, momentumWeight = 0.4 }) {
    this.targets = targets;
    this.windowMonths = windowMonths || 36;
    this.partition = partition;
    this.loa = loa;
    this.alpha = alpha;   // level smoothing
    this.beta = beta;     // slope smoothing
    this.phi = phi;       // damping parameter (Gardner-McKenzie 1985)
    this.momentumWeight = momentumWeight;
  }
  get testStart() { return this.partition.test_start; }
  get trainEnd() { return this.testStart - 1; }
  get outputLength() { return this.partition.output_length || 36; }

  fit(rows) {
    const panel = rows.cells ? rows : rowsToPanel(rows, this.targets[0]);
    const byEnt = panelByEntity(panel);
    const monthlyMeans = {};
    const holtState = {}; // {entity: {level, slope}}

    for (const [ent, arr] of byEnt) {
      const past = arr.filter((c) => c.month_id <= this.trainEnd);
      if (!past.length) continue;
      const sorted = [...past].sort((a, b) => a.month_id - b.month_id);
      const window = sorted.slice(-this.windowMonths);

      // 1. Calendar-month climatology (seasonal component)
      const sums = new Array(12).fill(0);
      const counts = new Array(12).fill(0);
      for (const c of window) {
        const cm = (c.month_id - 1) % 12;
        sums[cm] += c[this.targets[0]] || 0;
        counts[cm] += 1;
      }
      const totalSum = sums.reduce((s, v) => s + v, 0);
      const totalCount = counts.reduce((s, v) => s + v, 0);
      const overallMean = totalSum / Math.max(1, totalCount);
      const means = [];
      for (let i = 0; i < 12; i++) means.push(counts[i] > 0 ? sums[i] / counts[i] : overallMean);
      monthlyMeans[ent] = means;

      // 2. Seasonally adjust: y_adj = y - seasonal[calMonth]
      const adj = window.map((c) => {
        const cm = (c.month_id - 1) % 12;
        return (c[this.targets[0]] || 0) - (means[cm] || 0);
      });

      // 3. Holt's linear trend on seasonally-adjusted series
      //    Initialize: level = first adj, slope = (second - first)
      let level = adj[0] || 0;
      let slope = adj.length > 1 ? (adj[1] - adj[0]) : 0;
      for (let i = 1; i < adj.length; i++) {
        const prevLevel = level;
        level = this.alpha * adj[i] + (1 - this.alpha) * (level + this.phi * slope);
        slope = this.beta * (level - prevLevel) + (1 - this.beta) * this.phi * slope;
      }
      holtState[ent] = { level, slope };
    }

    this._units = Object.keys(monthlyMeans).sort();
    this._monthlyMeans = monthlyMeans;
    this._holtState = holtState;
    return this;
  }

  predict(rows, sequenceNumber = 0) {
    const start = this.testStart + sequenceNumber;
    const months = Array.from({ length: this.outputLength }, (_, i) => start + i);
    const out = {};
    for (const t of this.targets) {
      const time = [], unit = [], y = [];
      for (let h = 0; h < months.length; h++) {
        const m = months[h];
        const cm = (m - 1) % 12;
        for (const u of this._units) {
          time.push(m); unit.push(u);
          const seasonal = this._monthlyMeans[u][cm] || 0;
          const st = this._holtState[u] || { level: 0, slope: 0 };
          // Damped trend: sum of φ^j for j=1..h (Gardner-McKenzie)
          let dampedTrend = 0;
          let phiPow = this.phi;
          for (let j = 1; j <= h + 1; j++) {
            dampedTrend += phiPow * st.slope;
            phiPow *= this.phi;
          }
          const val = Math.max(0, st.level + dampedTrend + seasonal);
          y.push([+val.toFixed(3)]);
        }
      }
      out[t] = makeFrame(y, time, unit, this.loa, t);
    }
    return out;
  }
}

/**
 * Spatial Frequency Ratio — computes observed/expected ratio per entity.
 * Based on the Bayesian spatial risk methodology (Cambridge, 2024) and the
 * Frequency Ratio method for conflict prediction (PMC, 2024).
 *
 * Normalizes raw counts by the expected count (overall rate × entity time
 * exposure), producing a risk ratio that is comparable across entities with
 * different base rates. More robust for geographic ranking than raw projected
 * counts.
 */
export function computeFrequencyRatios(panel, target) {
  const byEnt = panelByEntity(panel);
  const totalObs = 0;
  const totalMonths = 0;
  const ratios = {};
  let grandTotal = 0;
  let grandMonths = 0;
  for (const [, arr] of byEnt) {
    grandTotal += arr.reduce((s, c) => s + (c[target] || 0), 0);
    grandMonths += arr.length;
  }
  const overallRate = grandMonths > 0 ? grandTotal / grandMonths : 0;
  for (const [ent, arr] of byEnt) {
    const obs = arr.reduce((s, c) => s + (c[target] || 0), 0);
    const exp = overallRate * arr.length;
    ratios[ent] = exp > 0 ? obs / exp : 0;
  }
  return ratios;
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