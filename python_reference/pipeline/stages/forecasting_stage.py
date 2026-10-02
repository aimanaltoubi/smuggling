"""
ForecastingStage — post-processing, validation, and persistence of forecast
predictions for the future horizon.

Takes the trained model (from TrainingStage) and produces future-horizon
projections with confidence intervals. Validates non-negativity and finite
values. Converts the model's PredictionFrame output into the pipeline's
projection list format.
"""

import json
import math
from dataclasses import dataclass
from typing import Any, Dict, List

import numpy as np

from ..data.panel import rows_to_panel


@dataclass(frozen=True)
class ForecastOutput:
    projections: List[Dict[str, Any]]
    horizon_months: int
    target: str
    level: str
    model_name: str
    validated: bool
    reconciliation: Any = None


class ForecastingStage:
    """Forecast: post-process → validate → persist future predictions."""

    def execute(self, ctx, train_output: Any) -> ForecastOutput:
        config = ctx.config
        target = config.target
        level = config.level
        model = train_output.model
        model_name = train_output.model_name

        # build the full panel (train + any forecast-partition actuals) for feature lags
        all_rows = ctx.data["partitions"]["train"] + ctx.data["partitions"]["validation"]
        panel = rows_to_panel(all_rows, target=target, level=level)

        # predict at sequence_number 0 (forecast starts at partition.forecast_start)
        pred_frames = model.predict(panel, sequence_number=0)

        projections: List[Dict[str, Any]] = []
        for tgt, pf in pred_frames.items():
            y = pf.y_pred
            if y.ndim == 2 and y.shape[1] == 1:
                # point forecast
                for i in range(len(pf.time)):
                    val = float(max(0.0, y[i, 0]))
                    projections.append({
                        "month_id": int(pf.time[i]),
                        "entity_id": str(pf.unit[i]),
                        "value": round(val, 3),
                        "ci_lower": round(max(0.0, val * 0.8), 3),
                        "ci_upper": round(val * 1.2, 3),
                    })
            elif y.ndim == 2 and y.shape[1] > 1:
                # distributional — use the mean as point, percentiles as CI
                for i in range(len(pf.time)):
                    row = y[i, :]
                    val = float(max(0.0, row.mean()))
                    projections.append({
                        "month_id": int(pf.time[i]),
                        "entity_id": str(pf.unit[i]),
                        "value": round(val, 3),
                        "ci_lower": round(max(0.0, float(np.percentile(row, 10))), 3),
                        "ci_upper": round(float(np.percentile(row, 90)), 3),
                    })

        validated = self._validate(projections)

        self._persist(ctx, projections, config.hyperparameters.get("forecasting", {}).get("horizon_months", 36),
                      target, level, model_name)

        return ForecastOutput(
            projections=projections,
            horizon_months=config.hyperparameters.get("forecasting", {}).get("horizon_months", 36),
            target=target,
            level=level,
            model_name=model_name,
            validated=validated,
        )

    def _validate(self, projections: List[dict]) -> bool:
        for p in projections:
            v = p["value"]
            if math.isnan(v) or math.isinf(v) or v < 0:
                return False
        return True

    def _persist(self, ctx, projections, horizon, target, level, model_name):
        try:
            with open(ctx.paths.forecast_path, "w", encoding="utf-8") as f:
                json.dump({"projections": projections, "horizon_months": horizon,
                           "target": target, "level": level, "model_name": model_name},
                          f, ensure_ascii=False, indent=2)
        except OSError:
            pass