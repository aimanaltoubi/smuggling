/**
 * EnsembleManager — aggregation + optional reconciliation of multiple models.
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

export default class EnsembleManager {
  constructor(spec) {
    this.spec = spec;
    this.reconciler = new ReconciliationModule();
  }

  _resolveWeights(n) {
    if (this.spec.weights == null) return Array(n).fill(1 / n);
    if (this.spec.weights.length !== n)
      throw new Error(`weights length ${this.spec.weights.length} != members ${n}`);
    const total = this.spec.weights.reduce((a, b) => a + b, 0);
    return this.spec.weights.map((w) => w / total);
  }

  aggregate(forecasts) {
    if (!forecasts.length) throw new Error("no member forecasts to aggregate");
    const weights = this._resolveWeights(forecasts.length);
    const index = {};
    for (const [fc, w] of forecasts.map((f, i) => [f, weights[i]])) {
      for (const proj of fc.projections || []) {
        const key = `${proj.month_id}::${proj.entity_id}`;
        if (!index[key])
          index[key] = { month_id: proj.month_id, entity_id: proj.entity_id, value: 0, members: 0 };
        index[key].value += proj.value * w;
        index[key].members += 1;
      }
    }
    let aggregated = {
      ensemble_name: this.spec.name,
      members: this.spec.members,
      weights,
      projections: Object.values(index),
    };
    if (this.spec.reconcile) aggregated = this.reconciler.reconcile(aggregated);
    return aggregated;
  }
}