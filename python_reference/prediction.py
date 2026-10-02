"""
Next-event predictive analytics - portable Python reference.
Mirrors src/lib/analytics/prediction.js. Combines the seasonal forecast
(when + how many) with a spatial risk model (where).

Usage:
    import pandas as pd
    from forecasting import build_monthly_series, forecast_series
    from prediction import predict_next_event
    df = pd.read_excel("incidents.xlsx")
    result = predict_next_event(df)
"""
import numpy as np
import pandas as pd
from forecasting import build_monthly_series, forecast_series


def predict_next_event(df: pd.DataFrame, horizon_months: int = 1) -> dict:
    monthly = build_monthly_series(df, "incidents")
    detained_monthly = build_monthly_series(df, "detained")

    inc_forecast = forecast_series(monthly, "incidents", 12, 2)
    detained_forecast = forecast_series(detained_monthly, "detained", 12, 2)
    next_month = inc_forecast["projection"][0]
    next_month_detained = detained_forecast["projection"][0]

    risk = spatial_risk(df, next_month)
    type_risk = type_risk_model(df, next_month)
    predicted_type = type_risk["top_type"]

    type_records = df[df["incident_type"] == predicted_type]
    avg_detained = (
        type_records["detained_count"].mean()
        if not type_records.empty
        else next_month_detained["value"] / max(1, next_month["value"])
    )

    return {
        "when": {
            "period": next_month["period"],
            "date": next_month["date"],
            "expected_incidents": round(next_month["value"], 1),
            "confidence": confidence_label(next_month["value"], inc_forecast["resid_std"]),
        },
        "where": {
            "governorate": risk["top_governorate"],
            "location": risk["top_location"],
            "risk_score": round(risk["top_score"], 3),
            "ranking": risk["ranking"][:5],
        },
        "how_many": {
            "predicted_type": predicted_type,
            "expected_detained_per_incident": round(float(avg_detained), 1),
            "expected_total_detained": round(next_month_detained["value"], 1),
        },
        "reasoning": {
            "seasonal": f"النموذج الموسمي يتنبأ بـ {next_month['value']:.1f} حادث في {next_month['period']}",
            "spatial": f"{risk['top_governorate']} هي الأعلى مخاطر بناءً على النشاط الأخير والحصة التاريخية",
            "type_reason": type_risk["reason"],
        },
    }


def spatial_risk(df: pd.DataFrame, next_month: dict) -> dict:
    d = df.copy()
    d["incident_date"] = pd.to_datetime(d["incident_date"], errors="coerce")
    d = d.dropna(subset=["incident_date"])
    now = d["incident_date"].max()
    recent_cutoff = now - pd.Timedelta(days=90)

    d["recency_weight"] = np.where(d["incident_date"] >= recent_cutoff, 2.0, 1.0)
    gov = d.groupby("governorate").agg(
        count=("incident_id", "count"),
        weight=("recency_weight", "sum"),
        detained=("detained_count", "sum"),
    ).reset_index()
    total_weight = gov["weight"].sum() or 1.0

    forecast_month = next_month["date"].month
    month_d = d[d["incident_date"].dt.month == forecast_month]
    month_gov = month_d["governorate"].value_counts()
    month_total = month_gov.sum() or 1

    ranking = []
    for _, row in gov.iterrows():
        g = row["governorate"]
        historical_share = row["weight"] / total_weight
        seasonal_share = month_gov.get(g, 0) / month_total
        score = 0.5 * historical_share + 0.5 * seasonal_share
        ranking.append({
            "governorate": g,
            "score": score,
            "historical_share": round(float(historical_share), 3),
            "seasonal_share": round(float(seasonal_share), 3),
            "incidents": int(row["count"]),
            "detained": int(row["detained"]),
        })
    ranking.sort(key=lambda x: x["score"], reverse=True)

    top = ranking[0]
    locs = d[d["governorate"] == top["governorate"]].groupby("location_name")["recency_weight"].sum().sort_values(ascending=False)
    top_loc = locs.index[0] if not locs.empty else None

    return {
        "top_governorate": top["governorate"],
        "top_score": top["score"],
        "top_location": top_loc,
        "ranking": ranking,
    }


def type_risk_model(df: pd.DataFrame, next_month: dict) -> dict:
    d = df.copy()
    d["incident_date"] = pd.to_datetime(d["incident_date"], errors="coerce")
    forecast_month = next_month["date"].month
    month_d = d[d["incident_date"].dt.month == forecast_month]
    counts = month_d["incident_type"].value_counts().to_dict()
    counts = {k: counts.get(k, 0) for k in ["تهريب", "تسلل"]}
    total = counts["تهريب"] + counts["تسلل"] or 1
    top_type = "تهريب" if counts["تهريب"] >= counts["تسلل"] else "تسلل"
    pct = round((counts[top_type] / total) * 100)
    reason = f"في شهر {forecast_month} تاريخياً، {top_type} هو الأكثر شيوعاً ({pct}%)"
    return {"top_type": top_type, "reason": reason, "month_type_counts": counts}


def confidence_label(expected, resid_std):
    cv = resid_std / expected if expected > 0 else 1
    if cv < 0.25:
        return "عالية"
    if cv < 0.5:
        return "متوسطة"
    return "منخفضة"