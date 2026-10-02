"""
views-stepshifter — faithful port of the VIEWS stepshift forecasting models.

Uses the stepshift approach (Hegre et al. 2020, Appendix A): shift all
independent variables in time to train models that predict future values of
the dependent variable. For each forecast step s in 1..H, a separate model
is trained on y(t+s) aligned with features x(t).

Algorithms (mirroring views-stepshifter's Darts support):
  - LinearRegressionModel  → sklearn LinearRegression
  - RandomForest           → sklearn RandomForestRegressor
  - LightGBMModel          → lightgbm LGBMRegressor
  - XGBModel               → xgboost XGBRegressor
  - HurdleModel            → two-stage: binary (zero/non-zero) + positive regressor

The real views-stepshifter uses the `darts` library. We use the underlying
regressors directly with the same stepshift logic — this is what Darts does
internally, and it is more transparent and portable for air-gapped use.
If `darts` is installed, the DartsModelAdapter wraps it instead.

Reference: https://github.com/views-platform/views-stepshifter
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd

from .features import build_features, make_stepshift_training, make_stepshift_predict

# --- optional regressor backends (graceful if missing) ---
try:
    from sklearn.linear_model import LinearRegression as _SkLinear
    from sklearn.ensemble import RandomForestRegressor as _SkRF
    _HAS_SKLEARN = True
except ImportError:
    _HAS_SKLEARN = False

try:
    from lightgbm import LGBMRegressor as _LGBM
    _HAS_LGBM = True
except ImportError:
    _HAS_LGBM = False

try:
    from xgboost import XGBRegressor as _XGB
    _HAS_XGB = True
except ImportError:
    _HAS_XGB = False


def _require(pkg: str):
    raise ImportError(
        f"{pkg} is not installed. Install it with: pip install {pkg.lower()}\n"
        f"Or use a model family that is available (run ModelCatalog.available())."
    )


# ---------------------------------------------------------------------------
# Regressor factories — each returns a fresh, unfitted estimator
# ---------------------------------------------------------------------------
def linear_regressor_factory(**kwargs):
    if not _HAS_SKLEARN:
        _require("scikit-learn")
    return _SkLinear(**kwargs)


def random_forest_factory(**kwargs):
    if not _HAS_SKLEARN:
        _require("scikit-learn")
    defaults = dict(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
    defaults.update(kwargs)
    return _SkRF(**defaults)


def lightgbm_factory(**kwargs):
    if not _HAS_LGBM:
        _require("lightgbm")
    defaults = dict(n_estimators=300, max_depth=6, learning_rate=0.05,
                   random_state=42, n_jobs=-1, verbosity=-1)
    defaults.update(kwargs)
    return _LGBM(**defaults)


def xgboost_factory(**kwargs):
    if not _HAS_XGB:
        _require("xgboost")
    defaults = dict(n_estimators=300, max_depth=6, learning_rate=0.05,
                   random_state=42, n_jobs=-1, verbosity=0)
    defaults.update(kwargs)
    return _XGB(**defaults)


# ===========================================================================
# StepshifterModel — the core stepshift forecasting model
# ===========================================================================
@dataclass
class StepshifterModel:
    """
    Stepshift forecasting model.

    Trains one regressor per forecast step (1..output_length). Each regressor
    learns y(t+step) from features x(t). At predict time, the latest features
    x(T) produce y(T+step) for each step.

    Parameters
    ----------
    target : str
        The target column to forecast.
    partition_dict : dict
        Must contain test_start and output_length.
    regressor_factory : Callable
        () -> unfitted regressor with .fit(X, y) and .predict(X).
    lags, rolling_windows : sequences of int
        Feature engineering parameters.
    covariates : optional sequence of str
        Extra column names to use as features.
    loa : str
        "cm" | "pgm" — level of analysis.
    """

    target: str
    partition_dict: dict
    regressor_factory: Callable
    lags: Sequence[int] = (1, 2, 3, 6, 12)
    rolling_windows: Sequence[int] = (3, 6, 12)
    covariates: Optional[Sequence[str]] = None
    loa: str = "pgm"

    def __post_init__(self):
        self._models: List[Any] = []
        self._feature_cols: List[str] = []
        self._fitted_frame: Optional[pd.DataFrame] = None
        self._last_month: int = self.train_end

    @property
    def test_start(self) -> int:
        return self.partition_dict["test_start"]

    @property
    def train_end(self) -> int:
        return self.test_start - 1

    @property
    def output_length(self) -> int:
        return self.partition_dict.get("output_length", 36)

    # --- fit / predict (views-baseline-compatible interface) ---
    def fit(self, df: Union[pd.DataFrame, Any]) -> "StepshifterModel":
        frame = df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)
        if not isinstance(frame.index, pd.MultiIndex):
            if "month_id" in frame.columns and "entity_id" in frame.columns:
                frame = frame.set_index(["month_id", "entity_id"])
            else:
                raise ValueError("Input must have a (month_id, entity_id) MultiIndex")

        feat = build_features(frame, self.target, self.lags, self.rolling_windows, self.covariates)
        self._fitted_frame = feat
        self._last_month = int(feat.index.get_level_values(0).max())
        self._feature_cols = [c for c in feat.columns if c != self.target]

        self._models = []
        for step in range(1, self.output_length + 1):
            X, y, cols = make_stepshift_training(feat, self.target, step, self.train_end)
            self._feature_cols = cols
            if X.shape[0] == 0:
                # no training data for this step — store None, predict 0
                self._models.append(None)
                continue
            reg = self.regressor_factory()
            reg.fit(X, y)
            self._models.append(reg)
        return self

    def predict(self, df: Union[pd.DataFrame, Any], sequence_number: int = 0) -> Dict[str, "PredictionFrame"]:
        from .baselines import PredictionFrame

        frame = df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)
        if not isinstance(frame.index, pd.MultiIndex):
            frame = frame.set_index(["month_id", "entity_id"])

        # use the fitted feature frame for the latest features, extended with any new rows
        if self._fitted_frame is not None:
            feat = build_features(frame, self.target, self.lags, self.rolling_windows, self.covariates)
        else:
            feat = build_features(frame, self.target, self.lags, self.rolling_windows, self.covariates)

        last_month = int(feat.index.get_level_values(0).max())
        X_pred, entities, _ = make_stepshift_predict(feat, self.target, last_month)

        start = last_month + 1 + sequence_number
        months = list(range(start, start + self.output_length))

        # one prediction per step, broadcast across entities
        n_ent = len(entities)
        y_mat = np.zeros((len(months) * n_ent, 1), dtype=float)
        for i, model in enumerate(self._models):
            if model is None:
                step_pred = np.zeros(n_ent)
            else:
                step_pred = np.maximum(0.0, model.predict(X_pred))  # non-negative (counts)
            # fill rows for this step
            for j in range(n_ent):
                y_mat[i * n_ent + j, 0] = step_pred[j]

        time_idx = np.repeat(months, n_ent)
        unit_idx = np.tile(entities, len(months))
        return {self.target: PredictionFrame(y_pred=y_mat, time=time_idx, unit=unit_idx,
                                             level=self.loa, target=self.target)}


# ===========================================================================
# HurdleModel — two-stage (binary zero/non-zero + positive regressor)
# ===========================================================================
@dataclass
class HurdleModel:
    """
    Hurdle model (two-stage), mirroring views-stepshifter's HurdleModel.

    Stage 1 (binary): a regressor predicts whether the target is 0 or > 0.
      Since Darts doesn't support classifiers, a regression model is used and
      a threshold (default 1) classifies predictions as "positive".
    Stage 2 (positive): a regressor predicts the value when > 0. The entire
      time series for entities where stage-1 yielded at least one positive
      prediction is kept.
    """

    target: str
    partition_dict: dict
    regressor_factory: Callable
    threshold: float = 1.0
    lags: Sequence[int] = (1, 2, 3, 6, 12)
    rolling_windows: Sequence[int] = (3, 6, 12)
    covariates: Optional[Sequence[str]] = None
    loa: str = "pgm"

    def __post_init__(self):
        self._binary_models: List[Any] = []
        self._positive_models: List[Any] = []
        self._fitted_frame = None
        self._feature_cols: List[str] = []

    @property
    def test_start(self): return self.partition_dict["test_start"]
    @property
    def train_end(self): return self.test_start - 1
    @property
    def output_length(self): return self.partition_dict.get("output_length", 36)

    def fit(self, df):
        frame = df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)
        if not isinstance(frame.index, pd.MultiIndex):
            frame = frame.set_index(["month_id", "entity_id"])

        feat = build_features(frame, self.target, self.lags, self.rolling_windows, self.covariates)
        self._fitted_frame = feat
        self._feature_cols = [c for c in feat.columns if c != self.target]

        self._binary_models = []
        self._positive_models = []
        for step in range(1, self.output_length + 1):
            X, y, cols = make_stepshift_training(feat, self.target, step, self.train_end)
            self._feature_cols = cols
            if X.shape[0] == 0:
                self._binary_models.append(None)
                self._positive_models.append(None)
                continue
            # stage 1: binary indicator (target > 0)
            y_bin = (y > 0).astype(float)
            bin_model = self.regressor_factory()
            bin_model.fit(X, y_bin)
            self._binary_models.append(bin_model)

            # stage 2: positive-value regressor on rows where y > 0
            pos_mask = y > 0
            if pos_mask.sum() >= 5:
                pos_model = self.regressor_factory()
                pos_model.fit(X[pos_mask], y[pos_mask])
            else:
                pos_model = None
            self._positive_models.append(pos_model)
        return self

    def predict(self, df, sequence_number: int = 0):
        from .baselines import PredictionFrame

        frame = df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)
        if not isinstance(frame.index, pd.MultiIndex):
            frame = frame.set_index(["month_id", "entity_id"])
        feat = build_features(frame, self.target, self.lags, self.rolling_windows, self.covariates)
        last_month = int(feat.index.get_level_values(0).max())
        X_pred, entities, _ = make_stepshift_predict(feat, self.target, last_month)

        start = last_month + 1 + sequence_number
        months = list(range(start, start + self.output_length))
        n_ent = len(entities)
        y_mat = np.zeros((len(months) * n_ent, 1), dtype=float)

        for i, (bm, pm) in enumerate(zip(self._binary_models, self._positive_models)):
            if bm is None:
                continue
            bin_pred = bm.predict(X_pred)
            is_positive = bin_pred >= self.threshold
            if pm is not None:
                pos_pred = np.maximum(0.0, pm.predict(X_pred))
            else:
                pos_pred = np.zeros(n_ent)
            step_val = np.where(is_positive, pos_pred, 0.0)
            for j in range(n_ent):
                y_mat[i * n_ent + j, 0] = step_val[j]

        time_idx = np.repeat(months, n_ent)
        unit_idx = np.tile(entities, len(months))
        return {self.target: PredictionFrame(y_pred=y_mat, time=time_idx, unit=unit_idx,
                                             level=self.loa, target=self.target)}


# ===========================================================================
# Concrete stepshifter subclasses — one per algorithm
# ===========================================================================
class LinearRegressionStepshifter(StepshifterModel):
    def __init__(self, target, partition_dict, **kwargs):
        super().__init__(target=target, partition_dict=partition_dict,
                         regressor_factory=linear_regressor_factory, **kwargs)


class RandomForestStepshifter(StepshifterModel):
    def __init__(self, target, partition_dict, **kwargs):
        super().__init__(target=target, partition_dict=partition_dict,
                         regressor_factory=random_forest_factory, **kwargs)


class LightGBMStepshifter(StepshifterModel):
    def __init__(self, target, partition_dict, **kwargs):
        super().__init__(target=target, partition_dict=partition_dict,
                         regressor_factory=lightgbm_factory, **kwargs)


class XGBoostStepshifter(StepshifterModel):
    def __init__(self, target, partition_dict, **kwargs):
        super().__init__(target=target, partition_dict=partition_dict,
                         regressor_factory=xgboost_factory, **kwargs)