"""
EnsembleManager — aggregation + optional reconciliation of multiple models.

Pool-based weighting: member weights are derived from validation RMSE
(lower RMSE → higher weight), mirroring the VIEWS ensemble approach. If no
validation metrics are supplied, falls back to uniform weights.

Aggregation: weighted average of forecast predictions from N member models.
Reconciliation: hierarchical grid ↔ governorate alignment (delegated to
ReconciliationModule) applied after aggregation.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from ..modules.reconciliation.reconciliation_module import ReconciliationModule


@dataclass(frozen=True)
class EnsembleSpec:
    name: str
    members: List[str]           # model names (catalog names)
    weights: Optional[List[float]] = None   # explicit weights; None → pool-based
    reconcile: bool = True


def pool_weights(rmse_scores: List[float]) -> List[float]:
    """
    Convert RMSE scores into ensemble weights via inverse-RMSE pooling.

    weight_i = (1/rmse_i) / sum(1/rmse_j). Lower RMSE → higher weight.
    Models with non-finite RMSE get zero weight.
    """
    inv = []
    for r in rmse_scores:
        if r is None or not isinstance(r, (int, float)):
            inv.append(0.0)
        elif r != r or r == float("inf") or r <= 0:  # NaN or inf or non-positive
            inv.append(0.0)
        else:
            inv.append(1.0 / r)
    total = sum(inv)
    if total == 0:
        n = len(rmse_scores)
        return [1.0 / n] * n if n else []
    return [v / total for v in inv]


class EnsembleManager:
    """Aggregation + optional reconciliation across member model forecasts."""

    def __init__(self, spec: EnsembleSpec):
        self.spec = spec
        self.reconciler = ReconciliationModule()

    def _resolve_weights(self, n: int, rmse_scores: Optional[List[float]] = None) -> List[float]:
        if self.spec.weights is not None:
            if len(self.spec.weights) != n:
                raise ValueError(f"weights length {len(self.spec.weights)} != members {n}")
            total = sum(self.spec.weights)
            return [w / total for w in self.spec.weights] if total else [1.0 / n] * n
        if rmse_scores and len(rmse_scores) == n:
            return pool_weights(rmse_scores)
        return [1.0 / n] * n

    def aggregate(self, forecasts: List[Dict[str, Any]],
                  rmse_scores: Optional[List[float]] = None) -> Dict[str, Any]:
        """Weighted-average the forecast predictions of member models."""
        if not forecasts:
            raise ValueError("no member forecasts to aggregate")
        weights = self._resolve_weights(len(forecasts), rmse_scores)

        # align by (month_id, entity_id) key
        index: Dict[Tuple, dict] = {}
        for fc, w in zip(forecasts, weights):
            for proj in fc.get("projections", []):
                key = (proj["month_id"], proj["entity_id"])
                if key not in index:
                    index[key] = {"month_id": proj["month_id"], "entity_id": proj["entity_id"],
                                  "value": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "members": 0}
                index[key]["value"] += proj["value"] * w
                index[key]["ci_lower"] += proj.get("ci_lower", proj["value"]) * w
                index[key]["ci_upper"] += proj.get("ci_upper", proj["value"]) * w
                index[key]["members"] += 1

        aggregated = {
            "ensemble_name": self.spec.name,
            "members": self.spec.members,
            "weights": weights,
            "weighting_method": "pool_inverse_rmse" if rmse_scores else "uniform",
            "projections": list(index.values()),
        }

        if self.spec.reconcile:
            aggregated = self.reconciler.reconcile(aggregated)

        return aggregated