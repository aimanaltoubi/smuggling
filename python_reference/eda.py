"""
Exploratory Data Analysis (EDA) module - portable Python reference.
Mirrors src/lib/analytics/eda.js. Drop into an air-gapped Python app.

Usage:
    import pandas as pd
    from eda import run_eda
    df = pd.read_excel("incidents.xlsx")
    results = run_eda(df)
"""
import numpy as np
import pandas as pd

OMAN_BOUNDS = {"lat_min": 16.5, "lat_max": 26.6, "lng_min": 51.9, "lng_max": 60.0}


def run_eda(df: pd.DataFrame) -> dict:
    return {
        "quality": data_quality(df),
        "distributions": distributions(df),
        "seasonality": seasonality(df),
        "predictors": strongest_predictors(df),
        "summary": summary(df),
    }


def data_quality(df: pd.DataFrame) -> dict:
    fields = [
        "incident_id", "incident_date", "location_name", "governorate",
        "latitude", "longitude", "incident_type", "ethnicity",
        "detained_count", "details",
    ]
    missing = {f: int(df[f].isna().sum()) for f in fields if f in df.columns}
    duplicate_ids = int(df["incident_id"].duplicated().sum()) if "incident_id" in df else 0
    invalid_coords = 0
    if "latitude" in df and "longitude" in df:
        invalid_coords = int(
            (
                df["latitude"].isna()
                | df["longitude"].isna()
                | (df["latitude"] < OMAN_BOUNDS["lat_min"])
                | (df["latitude"] > OMAN_BOUNDS["lat_max"])
                | (df["longitude"] < OMAN_BOUNDS["lng_min"])
                | (df["longitude"] > OMAN_BOUNDS["lng_max"])
            ).sum()
        )
    negative_counts = int((df["detained_count"] < 0).sum()) if "detained_count" in df else 0
    invalid_dates = 0
    if "incident_date" in df:
        invalid_dates = int(pd.to_datetime(df["incident_date"], errors="coerce").isna().sum())
    return {
        "total_records": len(df),
        "missing": missing,
        "duplicate_ids": duplicate_ids,
        "invalid_coords": invalid_coords,
        "negative_counts": negative_counts,
        "invalid_dates": invalid_dates,
    }


def distributions(df: pd.DataFrame) -> dict:
    detained = df["detained_count"].dropna()
    stats = {
        "count": int(detained.count()),
        "min": float(detained.min()),
        "max": float(detained.max()),
        "mean": float(detained.mean()),
        "median": float(detained.median()),
        "std": float(detained.std()),
        "sum": float(detained.sum()),
    }
    by_type = df["incident_type"].value_counts().to_dict() if "incident_type" in df else {}
    by_governorate = df["governorate"].value_counts().to_dict() if "governorate" in df else {}
    by_ethnicity = df["ethnicity"].value_counts().to_dict() if "ethnicity" in df else {}
    detained_by_type = (
        df.groupby("incident_type")["detained_count"].sum().to_dict()
        if "detained_count" in df and "incident_type" in df
        else {}
    )
    return {
        "detained_stats": stats,
        "by_type": by_type,
        "by_governorate": by_governorate,
        "by_ethnicity": by_ethnicity,
        "detained_by_type": detained_by_type,
    }


def seasonality(df: pd.DataFrame) -> dict:
    d = df.copy()
    d["incident_date"] = pd.to_datetime(d["incident_date"], errors="coerce")
    d = d.dropna(subset=["incident_date"])
    d["month"] = d["incident_date"].dt.month
    monthly = d.groupby("month").agg(incidents=("incident_id", "count"), detained=("detained_count", "sum")).reindex(range(1, 13), fill_value=0)
    inc_means = monthly["incidents"].values
    mean = inc_means.mean()
    var = inc_means.var()
    seasonal_strength = float(np.sqrt(var) / mean) if mean > 0 else 0.0
    return {
        "months": monthly.reset_index().to_dict("records"),
        "seasonal_strength": round(seasonal_strength, 3),
    }


def correlation_ratio(categories: pd.Series, values: pd.Series) -> float:
    """Eta squared: fraction of numeric variance explained by a categorical grouping."""
    df = pd.DataFrame({"cat": categories, "val": values}).dropna()
    if df.empty:
        return 0.0
    grand_mean = df["val"].mean()
    grouped = df.groupby("cat")["val"]
    between = sum(len(g) * (g.mean() - grand_mean) ** 2 for _, g in grouped)
    total = ((df["val"] - grand_mean) ** 2).sum()
    return float(between / total) if total > 0 else 0.0


def strongest_predictors(df: pd.DataFrame) -> list:
    if "detained_count" not in df:
        return []
    candidates = [
        ("governorate", "المحافظة"),
        ("incident_type", "نوع الحادث"),
        ("ethnicity", "الجنسية"),
        ("location_name", "الموقع"),
    ]
    results = []
    for field, label in candidates:
        if field in df:
            eta2 = correlation_ratio(df[field], df["detained_count"])
            results.append({"field": field, "label": label, "eta_squared": round(eta2, 3)})
    return sorted(results, key=lambda x: x["eta_squared"], reverse=True)


def summary(df: pd.DataFrame) -> dict:
    d = df.copy()
    d["incident_date"] = pd.to_datetime(d["incident_date"], errors="coerce")
    valid = d["incident_date"].dropna()
    return {
        "total_incidents": len(df),
        "total_detained": int(df["detained_count"].sum()) if "detained_count" in df else 0,
        "date_range": {
            "start": valid.min().to_pydatetime() if not valid.empty else None,
            "end": valid.max().to_pydatetime() if not valid.empty else None,
        },
        "by_type": df["incident_type"].value_counts().to_dict() if "incident_type" in df else {},
    }