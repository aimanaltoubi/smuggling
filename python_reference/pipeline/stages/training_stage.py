"""
TrainingStage — fits the forecasting model and creates a training log.

Uses the dependency-free Holt-Winters triple exponential smoothing from
forecasting.py (portable, air-gapped). Produces a fitted-model artifact
(serialized as JSON) plus a training log with provenance metadata.

WandB alerts are stubbed (no network in air-gapped mode).
"""

import json
from dataclasses import dataclass, asdict
from typing import Any, Dict, List

from forecasting import prepare_monthly_series, holt_winters_forecast


@dataclass(frozen=True)
class TrainingOutput:
    artifact: Dict[str, Any]       # serialized fitted model
    fitted_values: List[Dict[str, Any]]
    training_log: Dict[str, Any]


class TrainingStage:
    """Train: fit model → create artifact → log provenance."""

    def execute(self, ctx) -> TrainingOutput:
        train_rows = ctx.data["partitions"]["train"]
        config = ctx.config
        target = config.target

        series = prepare_monthly_series(train_rows, metric=target)
        hp = config.hyperparameters.get("forecasting", {})
        horizon = hp.get("horizon_months", 48)

        forecast_result = holt_winters_forecast(
            series,
            horizon=horizon,
            alpha=hp.get("alpha", 0.4),
            beta=hp.get("beta", 0.1),
            gamma=hp.get("gamma", 0.2),
            seasonal_periods=hp.get("seasonal_periods", 12),
        )

        artifact = {
            "model_name": config.model_name,
            "target": target,
            "level": config.level,
            "hyperparameters": hp,
            "fitted_state": forecast_result.get("model_state", {}),
            "n_train_points": len(series),
        }

        fitted_values = [
            {"month_id": m, "fitted": v}
            for m, v in zip(forecast_result.get("fitted_months", []),
                            forecast_result.get("fitted_values", []))
        ]

        training_log = {
            "model_name": config.model_name,
            "run_id": ctx.run_id,
            "target": target,
            "level": config.level,
            "n_train_points": len(series),
            "hyperparameters": hp,
            "stages_run": ["train"],
            "wandb_alert": "stubbed (air-gapped)",
        }

        # persist artifact + log
        self._persist(ctx, artifact, training_log)

        return TrainingOutput(artifact=artifact, fitted_values=fitted_values,
                              training_log=training_log)

    def _persist(self, ctx, artifact, log):
        try:
            with open(ctx.paths.artifact_path, "w", encoding="utf-8") as f:
                json.dump(artifact, f, ensure_ascii=False, indent=2)
            with open(ctx.paths.training_log_path, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        except OSError:
            pass  # air-gapped: persist best-effort