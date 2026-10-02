"""
ConfigurationManager — merges layered configuration into a single frozen view.

Layers (lowest → highest priority):
  1. deployment   — runtime environment, paths, io backends
  2. hyperparameters — model-specific tuning knobs
  3. meta — model name, level (priogrid/governorate), target, alias
  4. partitions — train / calibration / validation / forecast month ranges
  5. runtime overrides — CLI flags, highest priority

Validation enforces structural integrity and target specification.
"""

from dataclasses import dataclass, field, asdict
from copy import deepcopy
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class PartitionConfig:
    train_start: int          # month_id
    train_end: int
    calibration_start: int
    calibration_end: int
    validation_start: int
    validation_end: int
    forecast_start: int
    forecast_end: int


@dataclass(frozen=True)
class MergedConfig:
    deployment: Dict[str, Any]
    hyperparameters: Dict[str, Any]
    meta: Dict[str, Any]
    partitions: PartitionConfig
    runtime_overrides: Dict[str, Any]
    target: str
    level: str          # "priogrid" | "governorate"
    model_name: str

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["partitions"] = asdict(self.partitions)
        return d


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay onto base (overlay wins)."""
    result = deepcopy(base)
    for k, v in overlay.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = deepcopy(v)
    return result


class ConfigurationManager:
    """Merge + validate layered configuration into a frozen MergedConfig."""

    DEFAULT_DEPLOYMENT = {
        "io_backend": "local",        # local | appwrite
        "artifact_root": "artifacts",
        "log_dir": "logs",
        "wandb_enabled": False,
    }

    DEFAULT_HYPERPARAMETERS = {
        "forecasting": {
            "horizon_months": 36,    # VIEWS standard 36-month horizon
        },
        "model": {
            # model-specific hyperparameters; overridden by meta.model_name + CLI
            "window_months": 24,     # baseline rolling window
            "n_samples": 100,        # distributional draw count
            "lambda_mix": 0.3,       # MixtureBaseline local/global mix
            "family": "nb",          # ParametricConflictology family
            "transform": "none",
            "lags": [1, 2, 3, 6, 12],
            "rolling_windows": [3, 6, 12],
            "threshold": 1.0,        # HurdleModel zero/non-zero threshold
        },
        "prediction": {
            "horizon_days": 14,
        },
    }

    def __init__(self, meta: Optional[dict] = None, partitions: Optional[dict] = None):
        self._deployment = deepcopy(self.DEFAULT_DEPLOYMENT)
        self._hyperparameters = deepcopy(self.DEFAULT_HYPERPARAMETERS)
        self._meta = meta or {}
        self._partitions = partitions or {}
        self._overrides: Dict[str, Any] = {}

    # --- fluent builders ---
    def with_deployment(self, deployment: dict) -> "ConfigurationManager":
        self._deployment = _deep_merge(self._deployment, deployment)
        return self

    def with_hyperparameters(self, hp: dict) -> "ConfigurationManager":
        self._hyperparameters = _deep_merge(self._hyperparameters, hp)
        return self

    def with_overrides(self, overrides: dict) -> "ConfigurationManager":
        self._overrides = _deep_merge(self._overrides, overrides)
        return self

    def override_timestep(self, month_id: int) -> "ConfigurationManager":
        """Dynamically adjust the forecast partition to start at month_id."""
        self._overrides.setdefault("partitions", {})
        self._overrides["partitions"]["forecast_start"] = month_id
        return self

    # --- merge + validate ---
    def build(self) -> MergedConfig:
        merged_hp = _deep_merge(self._hyperparameters, self._overrides.get("hyperparameters", {}))
        merged_meta = _deep_merge(self._meta, self._overrides.get("meta", {}))
        merged_deployment = _deep_merge(self._deployment, self._overrides.get("deployment", {}))

        partitions_raw = _deep_merge(self._partitions, self._overrides.get("partitions", {}))
        self._validate_partitions(partitions_raw)
        partitions = PartitionConfig(**partitions_raw)

        target = merged_meta.get("target")
        if not target:
            raise ValueError("Configuration error: 'target' must be specified in meta")

        level = merged_meta.get("level", "governorate")
        if level not in ("priogrid", "governorate"):
            raise ValueError(f"Configuration error: level must be 'priogrid' or 'governorate', got {level!r}")

        return MergedConfig(
            deployment=merged_deployment,
            hyperparameters=merged_hp,
            meta=merged_meta,
            partitions=partitions,
            runtime_overrides=self._overrides,
            target=target,
            level=level,
            model_name=merged_meta.get("model_name", "oman_border_default"),
        )

    def _validate_partitions(self, p: dict) -> None:
        required = ["train_start", "train_end", "calibration_start",
                    "calibration_end", "validation_start", "validation_end",
                    "forecast_start", "forecast_end"]
        missing = [k for k in required if k not in p]
        if missing:
            raise ValueError(f"Configuration error: partitions missing keys: {missing}")
        if p["train_start"] > p["train_end"]:
            raise ValueError("Configuration error: train_start > train_end")
        if p["forecast_start"] <= p["validation_end"]:
            raise ValueError("Configuration error: forecast_start must follow validation_end")