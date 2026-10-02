"""
views-baseline — faithful port of the VIEWS baseline models.

All baselines operate on panel data indexed by (time `t`, unit `i`) —
`month_id` × spatial unit (`priogrid_id` at pgm, `country_id` at cm) — and
forecast one or more target columns over a horizon of `output_length` steps
starting at `test_start + sequence_number`.

Causal split (no leakage): every model is fit using only observations strictly
before the test period. train_end = test_start - 1.

Two output families:
  - Point forecasts:       y_pred shape (N, 1)
  - Distributional:        n_samples draws, y_pred shape (N, n_samples)

N = (number of units) × output_length.

Reference: https://github.com/views-platform/views-baseline
"""

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Prediction frame — mirrors views_frames.PredictionFrame (minimal)
# ---------------------------------------------------------------------------
@dataclass
class PredictionFrame:
    """A minimal PredictionFrame: y_pred array + SpatioTemporalIndex."""
    y_pred: np.ndarray          # shape (N, 1) for point, (N, n_samples) for distributional
    time: np.ndarray            # (N,) month_id per row
    unit: np.ndarray            # (N,) entity_id per row
    level: str                  # "cm" | "pgm"
    target: str

    def to_dataframe(self) -> pd.DataFrame:
        """Flatten to a DataFrame indexed by (month_id, entity_id)."""
        if self.y_pred.ndim == 1:
            preds = self.y_pred.reshape(-1, 1)
        else:
            preds = self.y_pred
        cols = [f"y_pred_{i}" for i in range(preds.shape[1])] if preds.shape[1] > 1 else ["y_pred"]
        df = pd.DataFrame(preds, columns=cols)
        df["month_id"] = self.time
        df["entity_id"] = self.unit
        df["target"] = self.target
        return df.set_index(["month_id", "entity_id"])


def _to_feature_frame(df: Union[pd.DataFrame, Any]) -> pd.DataFrame:
    """Normalize input to a DataFrame with MultiIndex (month_id, entity_id)."""
    if isinstance(df, pd.DataFrame):
        out = df.copy()
        if not isinstance(out.index, pd.MultiIndex):
            # assume already has month_id, entity_id columns
            if "month_id" in out.columns and "entity_id" in out.columns:
                out = out.set_index(["month_id", "entity_id"])
            else:
                raise ValueError("Input must have a (month_id, entity_id) MultiIndex or those columns")
        out = out.sort_index()
        return out
    raise TypeError(f"Unsupported input type: {type(df)}")


def _units_with_history(frame: pd.DataFrame, target: str, train_end: int) -> List:
    """Units that have at least one observation of `target` before train_end."""
    sub = frame.loc[(slice(None), slice(None)), :] if True else frame
    # filter by time <= train_end
    mask = frame.index.get_level_values(0) <= train_end
    sub = frame[mask]
    return sorted(sub.index.get_level_values(1).unique().tolist())


# ===========================================================================
# Point forecast models
# ===========================================================================
class _BasePointModel:
    """Common scaffolding for point-forecast baselines."""

    def __init__(self, targets: Sequence[str], partition_dict: dict, loa: str):
        self.targets = list(targets)
        self.partition = partition_dict
        self.loa = loa            # "cm" | "pgm"
        self._fitted: Dict[str, Any] = {}

    @property
    def test_start(self) -> int:
        return self.partition["test_start"]

    @property
    def train_end(self) -> int:
        return self.test_start - 1

    @property
    def output_length(self) -> int:
        return self.partition.get("output_length", 36)

    def _units(self, frame: pd.DataFrame, target: str) -> List:
        return _units_with_history(frame, target, self.train_end)

    def fit(self, df: Union[pd.DataFrame, Any]) -> "_BasePointModel":
        frame = _to_feature_frame(df)
        for t in self.targets:
            self._fit_target(frame, t)
        return self

    def _fit_target(self, frame: pd.DataFrame, target: str) -> None:
        raise NotImplementedError

    def predict(self, df: Union[pd.DataFrame, Any], sequence_number: int = 0) -> Dict[str, PredictionFrame]:
        frame = _to_feature_frame(df)
        out: Dict[str, PredictionFrame] = {}
        start = self.test_start + sequence_number
        months = list(range(start, start + self.output_length))
        for t in self.targets:
            units = self._fitted.get(t, {}).get("units", [])
            y = self._predict_target(frame, t, units, months)
            time_idx = np.repeat(months, len(units))
            unit_idx = np.tile(units, len(months))
            out[t] = PredictionFrame(y_pred=y, time=time_idx, unit=unit_idx,
                                      level=self.loa, target=t)
        return out

    def _predict_target(self, frame, target, units, months) -> np.ndarray:
        raise NotImplementedError


class ZeroModel(_BasePointModel):
    """Predicts exactly 0 for every target, unit, and step. Lower-bound reference."""

    def _fit_target(self, frame, target):
        self._fitted[target] = {"units": self._units(frame, target)}

    def _predict_target(self, frame, target, units, months):
        n = len(units) * len(months)
        return np.zeros((n, 1), dtype=float)


class LocfModel(_BasePointModel):
    """Last Observation Carried Forward — persistence baseline."""

    def _fit_target(self, frame, target):
        units = self._units(frame, target)
        last_val: Dict[Any, float] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) > 0:
                    last_val[u] = float(sub.iloc[-1])
            except KeyError:
                continue
        self._fitted[target] = {"units": [u for u in units if u in last_val],
                                "last": last_val}

    def _predict_target(self, frame, target, units, months):
        last = self._fitted[target]["last"]
        rows = []
        for m in months:
            for u in units:
                rows.append([last.get(u, 0.0)])
        return np.array(rows, dtype=float)


class AverageModel(_BasePointModel):
    """Arithmetic mean of the unit's last `window_months` observations, held constant."""

    def __init__(self, targets, window_months: int, partition_dict: dict, loa: str):
        super().__init__(targets, partition_dict, loa)
        self.window_months = window_months

    def _fit_target(self, frame, target):
        units = self._units(frame, target)
        means: Dict[Any, float] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) == 0:
                    continue
                window = sub.iloc[-self.window_months:]
                means[u] = float(window.mean())
            except KeyError:
                continue
        self._fitted[target] = {"units": [u for u in units if u in means],
                                "means": means}

    def _predict_target(self, frame, target, units, months):
        means = self._fitted[target]["means"]
        rows = []
        for m in months:
            for u in units:
                rows.append([means.get(u, 0.0)])
        return np.array(rows, dtype=float)


# ===========================================================================
# Distributional models
# ===========================================================================
class _BaseDistModel:
    """Common scaffolding for distributional baselines (Monte-Carlo draws)."""

    def __init__(self, targets, partition_dict, loa, n_samples: int, seed: int = 42):
        self.targets = list(targets)
        self.partition = partition_dict
        self.loa = loa
        self.n_samples = n_samples
        self.seed = seed
        self._fitted: Dict[str, Any] = {}

    @property
    def test_start(self): return self.partition["test_start"]
    @property
    def train_end(self): return self.test_start - 1
    @property
    def output_length(self): return self.partition.get("output_length", 36)

    def fit(self, df):
        frame = _to_feature_frame(df)
        for t in self.targets:
            self._fit_target(frame, t)
        return self

    def _fit_target(self, frame, target): raise NotImplementedError

    def predict(self, df, sequence_number: int = 0) -> Dict[str, PredictionFrame]:
        frame = _to_feature_frame(df)
        out = {}
        start = self.test_start + sequence_number
        months = list(range(start, start + self.output_length))
        for t in self.targets:
            units = self._fitted.get(t, {}).get("units", [])
            rng = np.random.default_rng(self.seed)
            y = self._predict_target(frame, t, units, months, rng)
            time_idx = np.repeat(months, len(units))
            unit_idx = np.tile(units, len(months))
            out[t] = PredictionFrame(y_pred=y, time=time_idx, unit=unit_idx,
                                     level=self.loa, target=t)
        return out

    def _predict_target(self, frame, target, units, months, rng) -> np.ndarray:
        raise NotImplementedError


class ConflictologyModel(_BaseDistModel):
    """Empirical climatology — bootstrap resample of the unit's recent window."""

    def __init__(self, targets, window_months: int, partition_dict, loa, n_samples, seed=42):
        super().__init__(targets, partition_dict, loa, n_samples, seed)
        self.window_months = window_months

    def _fit_target(self, frame, target):
        units = _units_with_history(frame, target, self.train_end)
        histories: Dict[Any, np.ndarray] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) == 0:
                    continue
                window = sub.iloc[-self.window_months:].values.astype(float)
                histories[u] = window
            except KeyError:
                continue
        self._fitted[target] = {"units": [u for u in units if u in histories],
                                "histories": histories}

    def _predict_target(self, frame, target, units, months, rng):
        histories = self._fitted[target]["histories"]
        rows = []
        # fixed draw order: unit → time → target (reproducibility)
        for u in units:
            hist = histories.get(u, np.array([0.0]))
            for m in months:
                draw = rng.choice(hist, size=self.n_samples, replace=True)
                rows.append(draw)
        return np.array(rows, dtype=float)  # (N, n_samples)


class MixtureBaseline(_BaseDistModel):
    """Mixture of local (unit window) and global (all positive) empirical pools."""

    def __init__(self, targets, window_months, lambda_mix, n_samples, partition_dict, loa, seed=42):
        super().__init__(targets, partition_dict, loa, n_samples, seed)
        self.window_months = window_months
        self.lambda_mix = lambda_mix

    def _fit_target(self, frame, target):
        units = _units_with_history(frame, target, self.train_end)
        local: Dict[Any, np.ndarray] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) == 0:
                    continue
                local[u] = sub.iloc[-self.window_months:].values.astype(float)
            except KeyError:
                continue
        # global pool: all strictly-positive values across all units, full training span
        mask = frame.index.get_level_values(0) <= self.train_end
        all_vals = frame.loc[mask, target].values.astype(float)
        global_pool = all_vals[all_vals > 0]
        if global_pool.size == 0:
            global_pool = np.array([0.0])
        self._fitted[target] = {
            "units": [u for u in units if u in local],
            "local": local,
            "global": global_pool,
        }

    def _predict_target(self, frame, target, units, months, rng):
        local = self._fitted[target]["local"]
        global_pool = self._fitted[target]["global"]
        rows = []
        for u in units:
            loc = local.get(u, np.array([0.0]))
            for m in months:
                draw = np.empty(self.n_samples, dtype=float)
                use_global = rng.random(self.n_samples) < self.lambda_mix
                n_g = int(use_global.sum())
                n_l = self.n_samples - n_g
                if n_g > 0:
                    draw[use_global] = rng.choice(global_pool, size=n_g, replace=True)
                if n_l > 0:
                    draw[~use_global] = rng.choice(loc, size=n_l, replace=True)
                rows.append(draw)
        return np.array(rows, dtype=float)


class ParametricConflictology(_BaseDistModel):
    """Parametric climatology — fits a native-zero distribution (e.g. NB) to the window."""

    def __init__(self, targets, window_months, partition_dict, loa, n_samples,
                 family: str = "nb", transform: str = "none", seed=42):
        super().__init__(targets, partition_dict, loa, n_samples, seed)
        if transform == "log1p" and family in ("nb", "poisson"):
            raise ValueError(f"transform='log1p' is illegal for count family '{family}'")
        self.window_months = window_months
        self.family = family
        self.transform = transform

    def _fit_target(self, frame, target):
        units = _units_with_history(frame, target, self.train_end)
        params: Dict[Any, dict] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) == 0:
                    continue
                window = sub.iloc[-self.window_months:].values.astype(float)
                params[u] = self._fit_dist(window)
            except KeyError:
                continue
        self._fitted[target] = {"units": [u for u in units if u in params], "params": params}

    def _fit_dist(self, y: np.ndarray) -> dict:
        y = y[~np.isnan(y)]
        if y.size == 0:
            y = np.array([0.0])
        mean = float(y.mean())
        var = float(y.var())
        if self.family == "poisson":
            return {"family": "poisson", "lam": max(mean, 1e-6)}
        if self.family == "nb":
            # method-of-moments NB: r = mean^2 / (var - mean), p = r / (r + mean)
            if var <= mean:
                var = mean + 1e-6
            r = (mean ** 2) / max(var - mean, 1e-6)
            p = r / (r + mean) if (r + mean) > 0 else 0.5
            return {"family": "nb", "r": max(r, 1e-3), "p": min(max(p, 1e-6), 1 - 1e-6)}
        if self.family == "normal":
            return {"family": "normal", "loc": mean, "scale": max(var ** 0.5, 1e-6)}
        raise ValueError(f"unknown family '{self.family}'")

    def _sample(self, params, rng) -> np.ndarray:
        f = params["family"]
        if f == "poisson":
            return rng.poisson(params["lam"], self.n_samples).astype(float)
        if f == "nb":
            return rng.negative_binomial(params["r"], params["p"], self.n_samples).astype(float)
        if f == "normal":
            return np.maximum(0.0, rng.normal(params["loc"], params["scale"], self.n_samples))
        raise ValueError(f)

    def _predict_target(self, frame, target, units, months, rng):
        params = self._fitted[target]["params"]
        rows = []
        for u in units:
            p = params.get(u, {"family": "poisson", "lam": 0.0})
            for m in months:
                rows.append(self._sample(p, rng))
        return np.array(rows, dtype=float)


class ParametricHurdleConflictology(_BaseDistModel):
    """Hurdle model: zero-spike (Bernoulli) + continuous positive-part family."""

    EMIT_FLOOR = 1e-9

    def __init__(self, targets, window_months, partition_dict, loa, n_samples,
                 family: str = "gamma", transform: str = "none", seed=42):
        super().__init__(targets, partition_dict, loa, n_samples, seed)
        self.window_months = window_months
        self.family = family       # "lognormal" | "gumbel" | "gamma"
        self.transform = transform

    def _fit_target(self, frame, target):
        units = _units_with_history(frame, target, self.train_end)
        params: Dict[Any, dict] = {}
        for u in units:
            try:
                sub = frame.loc[(slice(None), u), target]
                sub = sub[sub.index.get_level_values(0) <= self.train_end]
                if len(sub) == 0:
                    continue
                window = sub.iloc[-self.window_months:].values.astype(float)
                params[u] = self._fit_hurdle(window)
            except KeyError:
                continue
        self._fitted[target] = {"units": [u for u in units if u in params], "params": params}

    def _fit_hurdle(self, y: np.ndarray) -> dict:
        y = y[~np.isnan(y)]
        if y.size == 0:
            y = np.array([0.0])
        zero_rate = float((y == 0).mean())
        pos = y[y > 0]
        if pos.size == 0:
            pos = np.array([self.EMIT_FLOOR])
        if self.transform == "log1p":
            pos = np.log1p(pos)
        if self.family == "lognormal":
            mu = float(np.log(pos).mean())
            sigma = max(float(np.log(pos).std()), 1e-6)
            return {"zero_rate": zero_rate, "family": "lognormal", "mu": mu, "sigma": sigma}
        if self.family == "gamma":
            mean = float(pos.mean())
            var = max(float(pos.var()), 1e-6)
            shape = mean ** 2 / var
            scale = mean / shape
            return {"zero_rate": zero_rate, "family": "gamma", "shape": shape, "scale": scale}
        if self.family == "gumbel":
            mu = float(pos.mean())
            beta = max(float(pos.std()) * 0.788, 1e-6)  # std = beta * pi/sqrt(6)
            return {"zero_rate": zero_rate, "family": "gumbel", "mu": mu, "beta": beta}
        raise ValueError(f"unknown family '{self.family}'")

    def _sample_positive(self, p, rng) -> np.ndarray:
        f = p["family"]
        if f == "lognormal":
            s = rng.lognormal(p["mu"], p["sigma"], self.n_samples)
        elif f == "gamma":
            s = rng.gamma(p["shape"], p["scale"], self.n_samples)
        elif f == "gumbel":
            s = rng.gumbel(p["mu"], p["beta"], self.n_samples)
        else:
            raise ValueError(f)
        if self.transform == "log1p":
            s = np.expm1(s)
        return np.maximum(s, self.EMIT_FLOOR)

    def _predict_target(self, frame, target, units, months, rng):
        params = self._fitted[target]["params"]
        rows = []
        for u in units:
            p = params.get(u, {"zero_rate": 1.0, "family": "gamma", "shape": 1.0, "scale": 1.0})
            for m in months:
                is_zero = rng.random(self.n_samples) < p["zero_rate"]
                pos = self._sample_positive(p, rng)
                draw = np.where(is_zero, 0.0, pos)
                rows.append(draw)
        return np.array(rows, dtype=float)