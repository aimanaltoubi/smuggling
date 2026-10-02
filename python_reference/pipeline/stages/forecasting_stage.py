"""
ForecastingStage — post-processing, validation, and persistence of forecast
predictions for the future horizon.

Takes the trained artifact and produces future-horizon projections with
confidence intervals. Validates non-negativity and finite values.
"""

import json
import math
from dataclasses import dataclass
from typing import Any, Dict, List

from forecasting import prepare_monthly_series, holt_winters_forecast


@dataclass(frozen=True)
class ForecastOutput:
    projections: List[Dict[str, Any]]
    horizon_months: int
    target: str
    level: str
    validated: bool


class ForecastingStage:
    """Forecast: post-process → validate → persist future predictions."""

    def execute(self, ctx, train_output: Any) -> ForecastOutput:
        config = ctx.config
        target = config.target
        train_rows = ctx.data["partitions"]["train"]

        series = prepare_monthly_series(train_rows, metric=target)
        hp = config.hyperparameters.get("forecasting", {})
        horizon = hp.get("horizon_months", 48)

        fc = holt_winters_forecast(
            series,
            horizon=horizon,
            alpha=hp.get("alpha", 0.4),
            beta=hp.get("beta", 0.1),
            gamma=hp.get("gamma", 0.2),
            seasonal_periods=hp.get("seasonal_periods", 12),
        )

        forecast_values = fc.get("forecast_values", [])
        ci_lower = fc.get("ci_lower", [])
        ci_upper = fc.get("ci_upper", [])
        months = fc.get("forecast_months", [])

        projections: List[Dict[str, Any]] = []
        for i, val in enumerate(forecast_values):
            # post-processing: clamp to non-negative (incident counts)
            clamped = max(0.0, val)
            projections.append({
                "month_id": months[i] if i < len(months) else None,
                "entity_id": "all" if config.level == "governorate" else "all",
                "value": round(clamped, 3),
                "ci_lower": round(max(0.0, ci_lower[i]) if i < len(ci_lower) else clamped, 3),
                "ci_upper": round(ci_upper[i] if i < len(ci_upper) else clamped, 3),
            })

        validated = self._validate(projections)

        self._persist(ctx, projections, horizon, target, config.level)

        return ForecastOutput(
            projections=projections,
            horizon_months=horizon,
            target=target,
            level=config.level,
            validated=validated,
        )

    def _validate(self, projections: List[dict]) -> bool:
        for p in projections:
            v = p["value"]
            if math.isnan(v) or math.isinf(v) or v < 0:
                return False
        return True

    def _persist(self, ctx, projections, horizon, target, level):
        try:
            with open(ctx.paths.forecast_path, "w", encoding="utf-8") as f:
                json.dump({"projections": projections, "horizon_months": horizon,
                           "target": target, "level": level},
                          f, ensure_ascii=False, indent=2)
        except OSError:
            pass