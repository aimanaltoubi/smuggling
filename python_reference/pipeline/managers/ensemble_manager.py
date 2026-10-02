"""
EnsembleManager — aggregation + optional reconciliation of multiple models.

Aggregation: weighted average of forecast predictions from N member models.
Reconciliation: hierarchical grid ↔ governorate alignment (delegated to
ReconciliationModule) applied after aggregation.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..modules.reconciliation.reconciliation_module import ReconciliationModule


@dataclass(frozen=True)
class EnsembleSpec:
    name: str
    members: List[str]           # model names
    weights: Optional[List[float]] = None   # uniform if None
    reconcile: bool = True


class EnsembleManager:
    """Aggregation + optional reconciliation across member model forecasts."""

    def __init__(self, spec: EnsembleSpec):
        self.spec = spec
        self.reconciler = ReconciliationModule()

    def _resolve_weights(self, n: int) -> List[float]:
        if self.spec.weights is None:
            return [1.0 / n] * n
        if len(self.spec.weights) != n:
            raise ValueError(f"weights length {len(self.spec.weights)} != members {n}")
        total = sum(self.spec.weights)
        return [w / total for w in self.spec.weights]

    def aggregate(self, forecasts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Weighted-average the forecast predictions of member models."""
        if not forecasts:
            raise ValueError("no member forecasts to aggregate")
        weights = self._resolve_weights(len(forecasts))

        # each forecast: {projections: [{month_id, entity_id, value, ...}], ...}
        # align by (month_id, entity_id) key
        index = {}
        for fc, w in zip(forecasts, weights):
            for proj in fc.get("projections", []):
                key = (proj["month_id"], proj["entity_id"])
                if key not in index:
                    index[key] = {"month_id": proj["month_id"], "entity_id": proj["entity_id"],
                                  "value": 0.0, "members": 0}
                index[key]["value"] += proj["value"] * w
                index[key]["members"] += 1

        aggregated = {
            "ensemble_name": self.spec.name,
            "members": self.spec.members,
            "weights": weights,
            "projections": list(index.values()),
        }

        if self.spec.reconcile:
            aggregated = self.reconciler.reconcile(aggregated)

        return aggregated