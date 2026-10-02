"""
VIEWS-compatible models for the Oman border forecasting pipeline.

Two families, mirroring the real views-platform repositories:

1. baselines  — faithful port of `views-baseline` (ZeroModel, LocfModel,
   AverageModel, ConflictologyModel, MixtureBaseline, ParametricConflictology,
   ParametricHurdleConflictology). Panel (month_id, entity_id), causal split,
   point + distributional outputs.

2. stepshifter — faithful port of `views-stepshifter` (Darts-based): the
   stepshift approach (Hegre et al. 2020, Appendix A) with LinearRegression,
   RandomForest, LightGBM, XGBoost, and Hurdle (two-stage) regressors.

All models follow the common interface:
    model.fit(df)                       # df: DataFrame, MultiIndex (month_id, entity_id)
    predictions = model.predict(df, sequence_number)
"""

from .baselines import (
    ZeroModel,
    LocfModel,
    AverageModel,
    ConflictologyModel,
    MixtureBaseline,
    ParametricConflictology,
    ParametricHurdleConflictology,
)
from .stepshifter import (
    StepshifterModel,
    HurdleModel,
    LinearRegressionStepshifter,
    RandomForestStepshifter,
    LightGBMStepshifter,
    XGBoostStepshifter,
)
from .catalog import ModelCatalog

__all__ = [
    "ZeroModel", "LocfModel", "AverageModel", "ConflictologyModel",
    "MixtureBaseline", "ParametricConflictology", "ParametricHurdleConflictology",
    "StepshifterModel", "HurdleModel",
    "LinearRegressionStepshifter", "RandomForestStepshifter",
    "LightGBMStepshifter", "XGBoostStepshifter",
    "ModelCatalog",
]