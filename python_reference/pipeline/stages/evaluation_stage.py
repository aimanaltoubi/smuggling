"""
EvaluationStage — metrics orchestration (step-wise, month-wise, time-series).

Uses the real fitted model to predict on the validation partition and
compares against actuals. Produces step-wise, month-wise, and time-series
metrics with prediction records.

Conflict type auto-inferred from target tokens (sb / ns / os → تهريب / تسلل / all).
"""

import json
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np

from ..data.panel import rows_to_panel


def _infer_conflict_type(target: str) -> str:
    """sb → تهريب, ns → تسلل, os → all (per ADR naming)."""
    t = target.lower()
    if "sb" in t or "تهريب" in t:
        return "تهريب"
    if "ns" in t or "تسلل" in t:
        return "تسلل"
    return "all"


def _mae(pred, actual):
    n = min(len(pred), len(actual))
    if n == 0:
        return float("nan")
    return float(np.mean(np.abs(np.asarray(pred[:n]) - np.asarray(actual[:n]))))


def _rmse(pred, actual):
    n = min(len(pred), len(actual))
    if n == 0:
        return float("nan")
    return float(np.sqrt(np.mean((np.asarray(pred[:n]) - np.asarray(actual[:n])) ** 2)))


@dataclass(frozen=True)
class EvaluationOutput:
    step_metrics: Dict[int, Dict[str, float]]
    month_metrics: Dict[int, Dict[str, float]]
    ts_metrics: Dict[str, float]
    conflict_type: str
    model_name: str
    eval_predictions: List[Dict[str, Any]]


class EvaluationStage:
    """Evaluate: metrics + eval predictions on the validation partition."""

    def execute(self, ctx, train_output: Optional[Any]) -> EvaluationOutput:
        config = ctx.config
        val_rows = ctx.data["partitions"]["validation"]
        train_rows = ctx.data["partitions"]["train"]
        target = config.target
        level = config.level
        model = train_output.model
        model_name = train_output.model_name
        conflict_type = _infer_conflict_type(target)

        # build panels
        train_panel = rows_to_panel(train_rows, target=target, level=level)
        val_panel = rows_to_panel(val_rows, target=target, level=level)

        if val_panel.empty or train_panel.empty:
            return EvaluationOutput(step_metrics={}, month_metrics={},
                                     ts_metrics={"overall_mae": float("nan"),
                                                 "overall_rmse": float("nan"),
                                                 "n_eval_points": 0},
                                     conflict_type=conflict_type, model_name=model_name,
                                     eval_predictions=[])

        # re-fit a model on train-only with validation as the test period
        from models.catalog import ModelCatalog
        partitions = config.partitions
        val_start = partitions.validation_start
        eval_partition = {
            "test_start": val_start,
            "output_length": max(1, partitions.validation_end - val_start + 1),
        }
        hp = config.hyperparameters.get("model", {})
        loa = "pgm" if level == "priogrid" else "cm"
        eval_model = ModelCatalog.get(model_name, target=target,
                                       partition_dict=eval_partition, loa=loa,
                                       hyperparameters=hp)
        eval_model.fit(train_panel)

        # predict over the validation horizon
        pred_frames = eval_model.predict(train_panel, sequence_number=0)
        pf = pred_frames.get(target)
        if pf is None:
            return EvaluationOutput(step_metrics={}, month_metrics={},
                                     ts_metrics={"overall_mae": float("nan"),
                                                 "overall_rmse": float("nan"),
                                                 "n_eval_points": 0},
                                     conflict_type=conflict_type, model_name=model_name,
                                     eval_predictions=[])

        # align predictions with actuals by (month_id, entity_id)
        pred_df = pf.to_dataframe()
        actuals = val_panel[[target]].copy()
        joined = pred_df.join(actuals, how="inner", rsuffix="_actual")
        if joined.empty:
            # no overlap — compare aggregated monthly totals
            pred_monthly = pred_df.groupby("month_id")["y_pred"].mean().sort_index()
            actual_monthly = val_panel.groupby("month_id")[target].sum().sort_index()
            common = pred_monthly.index.intersection(actual_monthly.index)
            preds = pred_monthly.loc[common].values
            acts = actual_monthly.loc[common].values
        else:
            preds = joined["y_pred"].values
            acts = joined[target].values

        # step-wise metrics (cumulative)
        step_metrics: Dict[int, Dict[str, float]] = {}
        for step in range(1, min(len(preds), len(acts)) + 1):
            step_metrics[step] = {
                "mae": _mae(preds[:step], acts[:step]),
                "rmse": _rmse(preds[:step], acts[:step]),
            }

        # month-wise metrics
        month_metrics: Dict[int, Dict[str, float]] = {}
        for i, mid in enumerate(sorted(set(joined.index.get_level_values(0))) if not joined.empty else []):
            if i < len(preds):
                month_metrics[int(mid)] = {
                    "mae": abs(float(preds[i]) - float(acts[i])),
                    "rmse": (float(preds[i]) - float(acts[i])) ** 2,
                }

        ts_metrics = {
            "overall_mae": _mae(preds, acts),
            "overall_rmse": _rmse(preds, acts),
            "n_eval_points": min(len(preds), len(acts)),
        }

        eval_predictions = [
            {"month_id": int(joined.index.get_level_values(0)[i]) if i < len(joined) else None,
             "entity_id": str(joined.index.get_level_values(1)[i]) if i < len(joined) else None,
             "predicted": float(preds[i]), "actual": float(acts[i]) if i < len(acts) else None}
            for i in range(min(len(preds), len(acts)))
        ]

        self._persist(ctx, step_metrics, month_metrics, ts_metrics, eval_predictions)

        return EvaluationOutput(
            step_metrics=step_metrics,
            month_metrics=month_metrics,
            ts_metrics=ts_metrics,
            conflict_type=conflict_type,
            model_name=model_name,
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