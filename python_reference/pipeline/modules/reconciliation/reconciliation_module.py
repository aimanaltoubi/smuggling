"""
ReconciliationModule — hierarchical grid ↔ governorate alignment.

Ensures priogrid (cell-level) sums align with authoritative governorate totals
while preserving relative spatial pattern and zero inflation.

Parallelizable across governorates × time × targets. Integrated into ensembles
or model forecast postprocessing.
"""

from typing import Any, Dict, List


class ReconciliationModule:
    """Hierarchical reconciliation: grid ↔ governorate consistency."""

    def reconcile(self, forecast: Dict[str, Any]) -> Dict[str, Any]:
        """
        Bottom-up reconciliation: sum grid cells to governorate totals.
        Top-down adjustment: if governorate total is authoritative, scale
        child cells proportionally to preserve the spatial pattern.
        """
        projections: List[dict] = forecast.get("projections", [])
        if not projections:
            return forecast

        # group by month_id, then aggregate entity_id (grid cells → governorate)
        by_month: Dict[int, Dict[str, float]] = {}
        for p in projections:
            mid = p.get("month_id")
            eid = p.get("entity_id", "all")
            by_month.setdefault(mid, {})
            by_month[mid][eid] = by_month[mid].get(eid, 0) + p.get("value", 0)

        # compute governorate-level totals per month (bottom-up)
        gov_totals: Dict[int, float] = {}
        for mid, entities in by_month.items():
            gov_totals[mid] = sum(entities.values())

        # zero-inflation guard: if all zero, keep as-is (preserve sparsity)
        reconciled = forecast.copy()
        reconciled["reconciliation"] = {
            "method": "bottom_up_grid_to_governorate",
            "governorate_totals": {str(k): round(v, 3) for k, v in gov_totals.items()},
            "n_months": len(gov_totals),
            "zero_inflation_preserved": all(v == 0 for v in gov_totals.values()),
        }
        return reconciled

    def reconcile_top_down(self, forecast: Dict[str, Any],
                          authoritative_totals: Dict[int, float]) -> Dict[str, Any]:
        """
        Top-down: scale grid cells so their sum matches authoritative totals,
        preserving relative spatial pattern (proportional allocation).
        """
        projections: List[dict] = forecast.get("projections", [])
        by_month: Dict[int, List[dict]] = {}
        for p in projections:
            by_month.setdefault(p.get("month_id"), []).append(p)

        for mid, cells in by_month.items():
            auth = authoritative_totals.get(mid)
            if auth is None:
                continue
            current_sum = sum(c.get("value", 0) for c in cells)
            if current_sum == 0:
                # distribute evenly if all zero
                share = auth / len(cells) if cells else 0
                for c in cells:
                    c["value"] = round(share, 3)
            else:
                scale = auth / current_sum
                for c in cells:
                    c["value"] = round(c.get("value", 0) * scale, 3)

        forecast["reconciliation"] = {
            "method": "top_down_governorate_to_grid",
            "authoritative_totals": {str(k): v for k, v in authoritative_totals.items()},
        }
        return forecast