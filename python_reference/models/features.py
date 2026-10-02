"""
Feature engineering for stepshift models — the stepshift approach
(Hegre et al. 2020, Appendix A).

The stepshift approach: shift all independent variables in time to train
models that predict future values of the dependent variable. For each
forecast step s in 1..H, the training target is y(t+s) aligned with
features x(t). At prediction time, the latest features x(T) produce
y(T+s).

Features built here (per (month_id, entity_id) cell):
  - lagged target values (y(t-1), y(t-2), ...)
  - rolling means / sums of the target
  - calendar features (month-of-year, quarter)
  - optional covariates passed through
"""

from typing import List, Optional, Sequence

import numpy as np
import pandas as pd


def build_features(frame: pd.DataFrame,
                   target: str,
                   lags: Sequence[int] = (1, 2, 3, 6, 12),
                   rolling_windows: Sequence[int] = (3, 6, 12),
                   covariates: Optional[Sequence[str]] = None) -> pd.DataFrame:
    """
    Build the feature matrix for the stepshift models.

    `frame` must have a (month_id, entity_id) MultiIndex and contain `target`.
    Returns a DataFrame indexed the same way, with engineered feature columns
    and the target column (unshifted — shifting happens at training time).
    """
    df = frame.copy().sort_index()
    if target not in df.columns:
        raise ValueError(f"target column '{target}' not in frame")

    # ensure every (month, entity) cell exists — forward-fill gaps with 0
    months = df.index.get_level_values(0)
    entities = df.index.get_level_values(1)
    full = pd.MultiIndex.from_product(
        [range(int(months.min()), int(months.max()) + 1),
         sorted(entities.unique())],
        names=["month_id", "entity_id"],
    )
    df = df.reindex(full)
    df[target] = df[target].fillna(0.0)

    grp = df.groupby(level="entity_id")[target]

    # lag features
    for lag in lags:
        df[f"lag_{lag}"] = grp.shift(lag)

    # rolling features (computed on the lagged series to avoid leakage)
    shifted = grp.shift(1)
    for w in rolling_windows:
        df[f"roll_mean_{w}"] = shifted.groupby(level="entity_id").rolling(w).mean().reset_index(level=0, drop=True)
        df[f"roll_sum_{w}"] = shifted.groupby(level="entity_id").rolling(w).sum().reset_index(level=0, drop=True)

    # calendar features (from month_id)
    mid = df.index.get_level_values(0)
    year = 1960 + (mid - 1) // 12
    month = ((mid - 1) % 12) + 1
    df["month_of_year"] = month
    df["quarter"] = ((month - 1) // 3) + 1
    df["sin_month"] = np.sin(2 * np.pi * (month - 1) / 12)
    df["cos_month"] = np.cos(2 * np.pi * (month - 1) / 12)

    # covariates pass-through
    if covariates:
        for c in covariates:
            if c in frame.columns:
                df[c] = frame[c].reindex(df.index)

    return df


def make_stepshift_training(df: pd.DataFrame,
                            target: str,
                            step: int,
                            train_end: int) -> tuple:
    """
    Build (X, y) training arrays for a single stepshift step `step`.

    y(t+step) is aligned with features x(t). Only rows where both t and
    t+step exist and t <= train_end are used (causal split, no leakage).
    """
    feat_cols = [c for c in df.columns if c != target]
    # the target at time t+step
    df_shifted = df.copy()
    df_shifted[f"_y_step_{step}"] = df_shifted.groupby(level="entity_id")[target].shift(-step)

    # keep rows where the base time t <= train_end and the shifted target is not NaN
    mask = (df_shifted.index.get_level_values(0) <= train_end) & df_shifted[f"_y_step_{step}"].notna()
    sub = df_shifted[mask]

    X = sub[feat_cols].fillna(0.0).values
    y = sub[f"_y_step_{step}"].values
    return X, y, feat_cols


def make_stepshift_predict(df: pd.DataFrame, target: str, last_month: int) -> tuple:
    """Build the feature row for prediction: latest features per entity."""
    feat_cols = [c for c in df.columns if c != target]
    # latest row per entity
    idx = df.index.get_level_values(0) == last_month
    sub = df[idx]
    X = sub[feat_cols].fillna(0.0).values
    entities = sub.index.get_level_values(1).values
    return X, entities, feat_cols