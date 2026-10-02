"""
Model catalog — factory for instantiating VIEWS-compatible models by name.

Mirrors views-baseline's BaselineModelCatalog and the views-models naming
convention (adjective_noun). Each model is a specific instantiation of an
algorithm with a predetermined set of hyperparameters on a defined queryset.

Usage:
    from models.catalog import ModelCatalog
    model = ModelCatalog.get("RandomForestStepshifter", config, partition_dict, loa="pgm")
    model.fit(df)
    preds = model.predict(df, sequence_number=0)
"""

from typing import Any, Dict, List, Optional

from .baselines import (
    ZeroModel, LocfModel, AverageModel, ConflictologyModel,
    MixtureBaseline, ParametricConflictology, ParametricHurdleConflictology,
)
from .stepshifter import (
    StepshifterModel, HurdleModel,
    LinearRegressionStepshifter, RandomForestStepshifter,
    LightGBMStepshifter, XGBoostStepshifter,
    _HAS_SKLEARN, _HAS_LGBM, _HAS_XGB,
)


class ModelCatalog:
    """Factory for VIEWS-compatible models."""

    # registry: name → (class, required_deps, family)
    _REGISTRY = {
        # --- baselines (views-baseline) ---
        "ZeroModel":                   (ZeroModel, [], "baseline"),
        "LocfModel":                   (LocfModel, [], "baseline"),
        "AverageModel":                (AverageModel, [], "baseline"),
        "ConflictologyModel":          (ConflictologyModel, [], "baseline"),
        "MixtureBaseline":             (MixtureBaseline, [], "baseline"),
        "ParametricConflictology":     (ParametricConflictology, [], "baseline"),
        "ParametricHurdleConflictology": (ParametricHurdleConflictology, [], "baseline"),
        # --- stepshifters (views-stepshifter) ---
        "LinearRegressionStepshifter": (LinearRegressionStepshifter, ["scikit-learn"], "stepshifter"),
        "RandomForestStepshifter":     (RandomForestStepshifter, ["scikit-learn"], "stepshifter"),
        "LightGBMStepshifter":         (LightGBMStepshifter, ["lightgbm"], "stepshifter"),
        "XGBoostStepshifter":          (XGBoostStepshifter, ["xgboost"], "stepshifter"),
        "HurdleModel":                 (HurdleModel, ["scikit-learn"], "stepshifter"),
    }

    _DEPS_AVAILABLE = {
        "scikit-learn": _HAS_SKLEARN,
        "lightgbm": _HAS_LGBM,
        "xgboost": _HAS_XGB,
    }

    @classmethod
    def list_models(cls) -> List[str]:
        return list(cls._REGISTRY.keys())

    @classmethod
    def available(cls) -> Dict[str, bool]:
        """Return availability per model (based on installed deps)."""
        out = {}
        for name, (_, deps, _) in cls._REGISTRY.items():
            out[name] = all(cls._DEPS_AVAILABLE.get(d, False) for d in deps)
        return out

    @classmethod
    def families(cls) -> Dict[str, List[str]]:
        out: Dict[str, List[str]] = {}
        for name, (_, _, fam) in cls._REGISTRY.items():
            out.setdefault(fam, []).append(name)
        return out

    @classmethod
    def get(cls, name: str, target: str, partition_dict: dict,
            loa: str = "pgm", hyperparameters: Optional[dict] = None) -> Any:
        """Instantiate a model by name."""
        if name not in cls._REGISTRY:
            raise KeyError(
                f"Unknown model '{name}'. Available: {cls.list_models()}"
            )
        model_cls, deps, _ = cls._REGISTRY[name]
        missing = [d for d in deps if not cls._DEPS_AVAILABLE.get(d, False)]
        if missing:
            raise ImportError(
                f"Model '{name}' requires {missing}. "
                f"Install with: pip install {' '.join(missing)}"
            )
        hp = hyperparameters or {}

        # baselines share (targets, partition_dict, loa) + extras
        if name in ("ZeroModel", "LocfModel"):
            return model_cls(targets=[target], partition_dict=partition_dict, loa=loa)
        if name == "AverageModel":
            return model_cls(targets=[target], window_months=hp.get("window_months", 12),
                             partition_dict=partition_dict, loa=loa)
        if name == "ConflictologyModel":
            return model_cls(targets=[target], window_months=hp.get("window_months", 24),
                             partition_dict=partition_dict, loa=loa,
                             n_samples=hp.get("n_samples", 100), seed=hp.get("seed", 42))
        if name == "MixtureBaseline":
            return model_cls(targets=[target], window_months=hp.get("window_months", 24),
                             lambda_mix=hp.get("lambda_mix", 0.3),
                             n_samples=hp.get("n_samples", 100),
                             partition_dict=partition_dict, loa=loa, seed=hp.get("seed", 42))
        if name == "ParametricConflictology":
            return model_cls(targets=[target], window_months=hp.get("window_months", 24),
                             partition_dict=partition_dict, loa=loa,
                             n_samples=hp.get("n_samples", 100),
                             family=hp.get("family", "nb"), transform=hp.get("transform", "none"),
                             seed=hp.get("seed", 42))
        if name == "ParametricHurdleConflictology":
            return model_cls(targets=[target], window_months=hp.get("window_months", 24),
                             partition_dict=partition_dict, loa=loa,
                             n_samples=hp.get("n_samples", 100),
                             family=hp.get("family", "gamma"), transform=hp.get("transform", "none"),
                             seed=hp.get("seed", 42))
        # stepshifters
        if name == "HurdleModel":
            return model_cls(target=target, partition_dict=partition_dict,
                             regressor_factory=None,  # set by subclass
                             threshold=hp.get("threshold", 1.0), loa=loa,
                             lags=hp.get("lags", (1, 2, 3, 6, 12)),
                             rolling_windows=hp.get("rolling_windows", (3, 6, 12)))
        # generic stepshifter
        return model_cls(target=target, partition_dict=partition_dict,
                         regressor_factory=None,  # set by subclass __init__
                         loa=loa,
                         lags=hp.get("lags", (1, 2, 3, 6, 12)),
                         rolling_windows=hp.get("rolling_windows", (3, 6, 12)))


# --- real ViEWS ensemble names (from views-models/ensembles) ---
ENSEMBLES = {
    "cruel_summer":  ["RandomForestStepshifter", "LightGBMStepshifter", "AverageModel"],
    "first_love":    ["LinearRegressionStepshifter", "RandomForestStepshifter", "LocfModel"],
    "pink_ponyclub": ["LightGBMStepshifter", "XGBoostStepshifter", "ConflictologyModel"],
    "rude_boy":      ["XGBoostStepshifter", "RandomForestStepshifter", "MixtureBaseline"],
    "skinny_love":   ["LinearRegressionStepshifter", "LightGBMStepshifter", "AverageModel"],
    "white_mustang": ["RandomForestStepshifter", "XGBoostStepshifter", "ParametricHurdleConflictology"],
}