"""
Seasonal forecasting - portable Python reference.
Mirrors src/lib/analytics/forecasting.js. Additive Holt-Winters triple
exponential smoothing with grid search over smoothing parameters.

For an air-gapped app you can use statsmodels as an alternative:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    model = ExponentialSmoothing(y, seasonal_periods=12, trend="add", seasonal="add").fit()
This file provides a dependency-free equivalent using numpy only.
"""
import numpy as np
import pandas as pd


def build_monthly_series(df: pd.DataFrame, value_key: str = "incidents") -> pd.DataFrame:
    d = df.copy()
    d["incident_date"] = pd.to_datetime(d["incident_date"], errors="coerce")
    d = d.dropna(subset=["incident_date"])
    d["period"] = d["incident_date"].dt.to_period("M")
    agg = d.groupby("period").agg(
        incidents=("incident_id", "count"),
        detained=("detained_count", "sum"),
    ).reset_index()
    agg["date"] = agg["period"].dt.to_timestamp()
    return agg.sort_values("date")


def holt_winters_additive(series, season_length=12, forecast_horizon=48):
    y = np.asarray(series, dtype=float)
    if len(y) < 2 * season_length:
        return simple_trend_forecast(y, forecast_horizon)

    best = {"sse": np.inf}
    grid = [0.1, 0.2, 0.3, 0.5, 0.7]
    for alpha in grid:
        for beta in grid:
            for gamma in grid:
                res = _fit_hw(y, season_length, alpha, beta, gamma)
                if res["sse"] < best["sse"]:
                    best = {**res, "alpha": alpha, "beta": beta, "gamma": gamma}

    n = len(y)
    forecast = []
    for h in range(1, forecast_horizon + 1):
        idx = (n + h - 1) % season_length
        forecast.append(max(0.0, best["level"] + h * best["trend"] + best["seasonals"][idx]))

    resid_std = best["resid_std"]
    ci = []
    for h, f in enumerate(forecast, start=1):
        w = resid_std * np.sqrt(1 + h * 0.15)
        ci.append({
            "lower80": max(0.0, f - 1.28 * w),
            "upper80": f + 1.28 * w,
            "lower95": max(0.0, f - 1.96 * w),
            "upper95": f + 1.96 * w,
        })
    return {
        "forecast": forecast,
        "ci": ci,
        "params": {"alpha": best["alpha"], "beta": best["beta"], "gamma": best["gamma"]},
        "sse": best["sse"],
        "resid_std": resid_std,
        "fitted": best["fit"],
    }


def _fit_hw(y, m, alpha, beta, gamma):
    season_avgs = []
    full_seasons = len(y) // m
    for i in range(full_seasons):
        sl = y[i * m:(i + 1) * m]
        season_avgs.append(sl.mean())
    level = season_avgs[0] if season_avgs else y.mean()
    trend = (season_avgs[1] - season_avgs[0]) / m if len(season_avgs) > 1 else 0.0
    seasonals = [y[i] - level for i in range(m)]
    fit = []
    sse = 0.0
    for t in range(len(y)):
        idx = t % m
        fc = max(0.0, level + trend + seasonals[idx])
        fit.append(fc)
        err = y[t] - fc
        sse += err * err
        new_level = alpha * (y[t] - seasonals[idx]) + (1 - alpha) * (level + trend)
        new_trend = beta * (new_level - level) + (1 - beta) * trend
        seasonals[idx] = gamma * (y[t] - new_level) + (1 - gamma) * seasonals[idx]
        level, trend = new_level, new_trend
    resid_std = np.sqrt(sse / len(y))
    return {"fit": fit, "sse": sse, "level": level, "trend": trend, "seasonals": seasonals, "resid_std": resid_std}


def simple_trend_forecast(y, horizon):
    n = len(y)
    x = np.arange(n)
    slope, intercept = np.polyfit(x, y, 1)
    forecast = [max(0.0, intercept + slope * (n + h - 1)) for h in range(1, horizon + 1)]
    resid_std = np.sqrt(np.mean((y - (intercept + slope * x)) ** 2))
    ci = []
    for h, f in enumerate(forecast, start=1):
        w = resid_std * np.sqrt(1 + h * 0.15)
        ci.append({
            "lower80": max(0.0, f - 1.28 * w),
            "upper80": f + 1.28 * w,
            "lower95": max(0.0, f - 1.96 * w),
            "upper95": f + 1.96 * w,
        })
    return {"forecast": forecast, "ci": ci, "params": {"method": "linear_trend"}, "sse": 0.0, "resid_std": resid_std, "fitted": (intercept + slope * x).tolist()}


def forecast_series(monthly_df, value_key, season_length=12, horizon=48):
    values = monthly_df[value_key].values
    result = holt_winters_additive(values, season_length, horizon)
    last = monthly_df["date"].iloc[-1]
    projection = []
    for h, val in enumerate(result["forecast"], start=1):
        d = pd.Timestamp(last) + pd.DateOffset(months=h)
        ci = result["ci"][h - 1]
        projection.append({
            "period": d.strftime("%Y-%m"),
            "date": d,
            "value": round(val, 2),
            "lower80": round(ci["lower80"], 2),
            "upper80": round(ci["upper80"], 2),
            "lower95": round(ci["lower95"], 2),
            "upper95": round(ci["upper95"], 2),
        })
    return {
        "projection": projection,
        "params": result["params"],
        "resid_std": round(result["resid_std"], 3),
        "fitted": result["fitted"],
    }