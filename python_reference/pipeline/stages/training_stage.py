"""
TrainingStage — fits the forecasting model and creates a training log.

Uses the real VIEWS-compatible models from `models.catalog.ModelCatalog`
(baselines + stepshifters). The fitted model is the artifact. Produces a
training log with provenance metadata.

WandB alerts are stubbed (no network in air-gapped mode); enable wandb in
requirements.txt + config.deployment.wandb_enabled for live logging.
"""

import json
import pickle
import base64
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..data.panel import rows_to_panel


@dataclass(frozen=True)
class TrainingOutput:
    model: Any                    # the fitted model object
    model_name: str
    artifact: Dict[str, Any]      # serialized metadata (model pickled separately)
    fitted_values: List[Dict[str, Any]]
    training_log: Dict[str, Any]


class TrainingStage:
    """Train: fit model → create artifact → log provenance."""

    def execute(self, ctx) -> TrainingOutput:
        from models.catalog import ModelCatalog

        train_rows = ctx.data["partitions"]["train"]
        config = ctx.config
        target = config.target
        level = config.level
        loa = "pgm" if level == "priogrid" else "cm"

        # build the panel
        panel = rows_to_panel(train_rows, target=target, level=level)

        # partition dict for the models (test_start = forecast_start)
        partitions = config.partitions
        model_partition = {
            "test_start": partitions.forecast_start,
            "output_length": config.hyperparameters.get("forecasting", {}).get("horizon_months", 36),
        }

        # resolve model name from config.meta, default to a stepshifter if available
        model_name = config.meta.get("model_name", "RandomForestStepshifter")
        hp = config.hyperparameters.get("model", {})

        model = ModelCatalog.get(model_name, target=target,
                                  partition_dict=model_partition, loa=loa,
                                  hyperparameters=hp)
        model.fit(panel)

        # fitted values (one-step-ahead on training data, if available)
        fitted_values = self._extract_fitted(model, panel)

        artifact = {
            "model_name": model_name,
            "target": target,
            "level": level,
            "loa": loa,
            "hyperparameters": hp,
            "n_train_points": len(panel),
            "n_entities": panel.index.get_level_values(1).nunique(),
            "model_family": "stepshifter" if "Stepshifter" in model_name or "Hurdle" in model_name else "baseline",
        }

        training_log = {
            "model_name": model_name,
            "run_id": ctx.run_id,
            "target": target,
            "level": level,
            "n_train_points": len(panel),
            "n_entities": panel.index.get_level_values(1).nunique(),
            "hyperparameters": hp,
            "stages_run": ["train"],
            "wandb_alert": "stubbed (air-gapped)" if not config.deployment.get("wandb_enabled") else "wandb_logged",
        }

        self._persist(ctx, model, artifact, training_log)

        return TrainingOutput(model=model, model_name=model_name, artifact=artifact,
                              fitted_values=fitted_values, training_log=training_log)

    def _extract_fitted(self, model, panel) -> List[Dict[str, Any]]:
        """Best-effort extraction of in-sample fitted values."""
        try:
            if hasattr(model, "_fitted_frame") and model._fitted_frame is not None:
                ff = model._fitted_frame
                target = model.target if hasattr(model, "target") else None
                if target and target in ff.columns:
                    return [
                        {"month_id": int(mid), "entity_id": str(eid), "fitted": float(val)}
                        for (mid, eid), val in zip(ff.index, ff[target].values)
                        if not (val != val)  # skip NaN
                    ][:200]  # cap for log size
        except Exception:
            pass
        return []

    def _persist(self, ctx, model, artifact, log):
        try:
            with open(ctx.paths.artifact_path, "w", encoding="utf-8") as f:
                json.dump(artifact, f, ensure_ascii=False, indent=2)
            with open(ctx.paths.training_log_path, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            # pickle the fitted model alongside the artifact
            import os
            model_path = ctx.paths.artifact_path.replace(".json", ".pkl")
            with open(model_path, "wb") as f:
                pickle.dump(model, f)
        except OSError:
            pass  # air-gapped: persist best-effort