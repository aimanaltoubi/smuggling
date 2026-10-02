"""
EvaluationStage — metrics orchestration (step-wise, month-wise, time-series).

Produces:
  - Step-wise metrics (per forecast horizon step)
  - Month-wise metrics (temporal slices)
  - Time-series metrics (sequence performance trajectory)

Conflict type auto-inferred from target tokens (sb / ns / os → تهريب / تسلل / all).
Files named per ADR conventions (artifact/output naming).
"""

import json
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from forecasting import prepare_monthly_series, holt_winters_forecast


def _infer_conflict_type(target: str) -> str:
    """sb → تهريب, ns → تسلل, os → all (per ADR naming)."""
    t = target.lower()
    if "sb" in t or "تهريب" in t:
        return "تهريب"
    if "ns" in t or "تسلل" in t:
        return "تسلل"
    return "all"


def _mae(pred: List[float], actual: List[float]) -> float:
    n = min(len(pred), len(actual))
    if n == 0:
        return float("nan")
    return sum(abs(pred[i] - actual[i]) for i in range(n)) / n


def _rmse(pred: List[float], actual: List[float]) -> float:
    n = min(len(pred), len(actual))
    if n == 0:
        return float("nan")
    return math.sqrt(sum((pred[i] - actual[i]) ** 2 for i in range(n)) / n)


@dataclass(frozen=True)
class EvaluationOutput:
    step_metrics: Dict[int, Dict[str, float]]   # step → {mae, rmse}
    month_metrics: Dict[int, Dict[str, float]]  # month_id → {mae, rmse}
    ts_metrics: Dict[str, float]                # overall trajectory
    conflict_type: str
    eval_predictions: List[Dict[str, Any]]


class EvaluationStage:
    """Evaluate: metrics + eval predictions on the validation partition."""

    def execute(self, ctx, train_output: Optional[Any]) -> EvaluationOutput:
        config = ctx.config
        val_rows = ctx.data["partitions"]["validation"]
        target = config.target
        conflict_type = _infer_conflict_type(target)

        val_series = prepare_monthly_series(val_rows, metric=target)
        train_rows = ctx.data["partitions"]["train"]
        train_series = prepare_monthly_series(train_rows, metric=target)

        hp = config.hyperparameters.get("forecasting", {})
        horizon = len(val_series) or hp.get("horizon_months", 12)

        fc = holt_winters_forecast(
            train_series,
            horizon=horizon,
            alpha=hp.get("alpha", 0.4),
            beta=hp.get("beta", 0.1),
            gamma=hp.get("gamma", 0.2),
            seasonal_periods=hp.get("seasonal_periods", 12),
        )
        preds = fc.get("forecast_values", [])
        actuals = [v for _, v in val_series]

        # step-wise metrics
        step_metrics: Dict[int, Dict[str, float]] = {}
        for step in range(1, min(len(preds), len(actuals)) + 1):
            step_metrics[step] = {
                "mae": _mae(preds[:step], actuals[:step]),
                "rmse": _rmse(preds[:step], actuals[:step]),
            }

        # month-wise metrics (per validation month)
        month_metrics: Dict[int, Dict[str, float]] = {}
        val_months = [m for m, _ in val_series]
        for i, mid in enumerate(val_months):
            if i < len(preds):
                month_metrics[mid] = {
                    "mae": abs(preds[i] - actuals[i]),
                    "rmse": (preds[i] - actuals[i]) ** 2,
                }

        # time-series overall
        ts_metrics = {
            "overall_mae": _mae(preds, actuals),
            "overall_rmse": _rmse(preds, actuals),
            "n_eval_points": min(len(preds), len(actuals)),
        }

        eval_predictions = [
            {"month_id": val_months[i] if i < len(val_months) else None,
             "predicted": preds[i], "actual": actuals[i] if i < len(actuals) else None}
            for i in range(min(len(preds), len(actuals)))
        ]

        self._persist(ctx, step_metrics, month_metrics, ts_metrics, eval_predictions)

        return EvaluationOutput(
            step_metrics=step_metrics,
            month_metrics=month_metrics,
            ts_metrics=ts_metrics,
            conflict_type=conflict_type,
            eval_predictions=eval_predictions,
        )

    def _persist(self, ctx, step, month, ts, preds):
        try:
            with open(ctx.paths.evaluation_path, "w", encoding="utf-8") as f:
                json.dump({"step_metrics": step, "month_metrics": month,
                           "ts_metrics": ts, "eval_predictions": preds},
                          f, ensure_ascii=False, indent=2)
        except OSError:
            pass