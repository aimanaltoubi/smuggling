/**
 * EnsembleManager — aggregation + optional reconciliation of multiple models.
 *
 * Pool-based weighting: member weights are derived from validation RMSE
 * (lower RMSE → higher weight via inverse-RMSE pooling), mirroring the VIEWS
 * ensemble approach. Falls back to uniform weights if no RMSE scores supplied.
 *
 * JS mirror of python_reference/pipeline/managers/ensemble_manager.py.
 */

import ReconciliationModule from "./ReconciliationModule";

export class EnsembleSpec {
  constructor(name, members, weights = null, reconcile = true) {
    this.name = name;
    this.members = members;
    this.weights = weights;
    this.reconcile = reconcile;
  }
}

export function poolWeights(rmseScores) {
  const inv = rmseScores.map((r) => {
    if (r == null || typeof r !== "number" || Number.isNaN(r) || !Number.isFinite(r) || r <= 0) return 0;
    return 1 / r;
  });
  const total = inv.reduce((a, b) => a + b, 0);
  if (total === 0) return rmseScores.map(() => 1 / rmseScores.length);
  return inv.map((v) => v / total);
}

export default class EnsembleManager {
  constructor(spec) {
    this.spec = spec;
    this.reconciler = new ReconciliationModule();
  }

  _resolveWeights(n, rmseScores = null) {
    if (this.spec.weights != null) {
      if (this.spec.weights.length !== n)
        throw new Error(`weights length ${this.spec.weights.length} != members ${n}`);
      const total = this.spec.weights.reduce((a, b) => a + b, 0);
      return total ? this.spec.weights.map((w) => w / total) : Array(n).fill(1 / n);
    }
    if (rmseScores && rmseScores.length === n) return poolWeights(rmseScores);
    return Array(n).fill(1 / n);
  }

  aggregate(forecasts, rmseScores = null) {
    if (!forecasts.length) throw new Error("no member forecasts to aggregate");
    const weights = this._resolveWeights(forecasts.length, rmseScores);
    const index = {};
    for (const [fc, w] of forecasts.map((f, i) => [f, weights[i]])) {
      for (const proj of fc.projections || []) {
        const key = `${proj.month_id}::${proj.entity_id}`;
        if (!index[key])
          index[key] = { month_id: proj.month_id, entity_id: proj.entity_id, value: 0, ci_lower: 0, ci_upper: 0, members: 0 };
        index[key].value += proj.value * w;
        index[key].ci_lower += (proj.ci_lower ?? proj.value) * w;
        index[key].ci_upper += (proj.ci_upper ?? proj.value) * w;
        index[key].members += 1;
      }
    }
    let aggregated = {
      ensemble_name: this.spec.name,
      members: this.spec.members,
      weights,
      weighting_method: rmseScores ? "pool_inverse_rmse" : "uniform",
      projections: Object.values(index),
    };
    if (this.spec.reconcile) aggregated = this.reconciler.reconcile(aggregated);
    return aggregated;
  }
}