"""
ModelPathManager — path + artifact resolution for a single model.

Canonical location: data/ (relocated from managers/ per ADR-045 to fix
dependency inversion). All existing import paths continue to work via
re-export shims.

Resolves: model directory, artifact files (fitted model, training log,
evaluation metrics, forecast predictions, HTML reports).
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelPaths:
    model_dir: str
    artifact_path: str       # fitted model artifact
    training_log_path: str
    evaluation_path: str     # metrics + eval predictions
    forecast_path: str       # future horizon predictions
    report_path: str         # HTML report
    config_path: str         # merged config snapshot


class ModelPathManager:
    """Resolve and create artifact paths for a model run."""

    def __init__(self, model_name: str, artifact_root: str = "artifacts"):
        self.model_name = model_name
        self.artifact_root = artifact_root

    def resolve(self, run_id: Optional[str] = None) -> ModelPaths:
        rid = run_id or "latest"
        base = os.path.join(self.artifact_root, self.model_name, rid)
        paths = ModelPaths(
            model_dir=base,
            artifact_path=os.path.join(base, "model.json"),
            training_log_path=os.path.join(base, "training_log.json"),
            evaluation_path=os.path.join(base, "evaluation.json"),
            forecast_path=os.path.join(base, "forecast.json"),
            report_path=os.path.join(base, "report.html"),
            config_path=os.path.join(base, "config.json"),
        )
        self._ensure_dirs(paths)
        return paths

    def _ensure_dirs(self, paths: ModelPaths) -> None:
        os.makedirs(paths.model_dir, exist_ok=True)

    def list_runs(self) -> list:
        model_base = os.path.join(self.artifact_root, self.model_name)
        if not os.path.isdir(model_base):
            return []
        return sorted(
            d for d in os.listdir(model_base)
            if os.path.isdir(os.path.join(model_base, d))
        )