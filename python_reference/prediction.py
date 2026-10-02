"""Dynamic short-term (next N days) tactical prediction.

Detects where the data actually stops (last incident date) and projects
forward from there using a daily-rate model: day-of-week effect + monthly
seasonal effect + recent-trend factor, combined with a spatial risk model.
Portable reference - mirrors src/lib/analytics/prediction.js.
"""

from datetime import date, timedelta
from collections import defaultdict

DAY = timedelta(days=1)

_MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
              "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]


def _fmt(d):
    return f"{d.day} {_MONTHS_AR[d.month - 1]} {d.year}"


def predict_next_event(incidents, horizon_days=14):
    """incidents: list of dicts with keys incident_date (ISO str), governorate,
    location_name, incident_type, detained_count. Returns a prediction dict or None."""
    valid = []
    for r in incidents:
        if not r.get("incident_date"):
            continue
        try:
            d = date.fromisoformat(r["incident_date"])
        except (ValueError, TypeError):
            continue
        valid.append({**r, "_d": d})
    if len(valid) < 2:
        return None

    valid.sort(key=lambda r: r["_d"])
    data_start = valid[0]["_d"]
    data_end = valid[-1]["_d"]
    forecast_start = data_end + DAY
    forecast_end = data_end + timedelta(days=horizon_days)

    # 1. Daily rate model
    total_days = max(1, (data_end - data_start).days + 1)
    overall_daily_rate = len(valid) / total_days

    dow_counts = [0] * 7
    for r in valid:
        dow_counts[r["_d"].weekday()] = 1  # placeholder; corrected below
    # python weekday: Mon=0..Sun=6 ; JS getDay: Sun=0..Sat=6
    dow_counts = [0] * 7
    for r in valid:
        js_dow = (r["_d"].weekday() + 1) % 7  # convert Mon=0 -> Sun=0
        dow_counts[js_dow] += 1
    dow_avg = len(valid) / 7
    dow_multiplier = [c / dow_avg if dow_avg else 1 for c in dow_counts]

    month_counts = [0] * 13
    for r in valid:
        month_counts[r["_d"].month] += 1
    month_avg = len(valid) / 12
    month_multiplier = [c / month_avg if month_avg else 1 for c in month_counts]

    recent_cutoff = data_end - timedelta(days=30)
    recent30 = [r for r in valid if r["_d"] >= recent_cutoff]
    recent_daily_rate = len(recent30) / 30
    trend_raw = recent_daily_rate / overall_daily_rate if overall_daily_rate else 1
    trend_factor = min(2, max(0.5, trend_raw))

    # 2. Expected incidents per day
    daily_forecast = []
    total_expected = 0.0
    d = forecast_start
    while d <= forecast_end:
        dow = (d.weekday() + 1) % 7
        mon = d.month
        expected = overall_daily_rate * dow_multiplier[dow] * month_multiplier[mon] * trend_factor
        daily_forecast.append({"date": d, "expected": round(expected, 3)})
        total_expected += expected
        d += DAY
    total_expected = round(total_expected, 2)

    peak = max(daily_forecast, key=lambda x: x["expected"])

    # 3. Spatial risk
    risk = _spatial_risk(valid, forecast_start, forecast_end)

    # 4. Type prediction
    type_risk = _type_risk(valid, forecast_start, forecast_end)

    # 5. Expected detained
    predicted_type = type_risk["top_type"]
    type_records = [r for r in valid if r["incident_type"] == predicted_type]
    if type_records:
        avg_detained = sum(r["detained_count"] for r in type_records) / len(type_records)
    else:
        avg_detained = sum(r["detained_count"] for r in valid) / len(valid)
    expected_total_detained = round(total_expected * avg_detained, 1)

    confidence = _confidence_label(len(valid), trend_raw)

    return {
        "data_endpoint": {
            "last_date": data_end, "last_date_label": _fmt(data_end),
            "first_date_label": _fmt(data_start),
            "total_records": len(valid), "days_spanned": total_days,
        },
        "forecast_window": {
            "start": forecast_start, "end": forecast_end, "days": horizon_days,
            "start_label": _fmt(forecast_start), "end_label": _fmt(forecast_end),
        },
        "model": {
            "overall_daily_rate": round(overall_daily_rate, 3),
            "recent_daily_rate": round(recent_daily_rate, 3),
            "trend_factor": round(trend_factor, 2),
        },
        "when": {
            "total_expected_incidents": total_expected,
            "peak_day": {"date": peak["date"], "label": _fmt(peak["date"]), "expected": round(peak["expected"], 2)},
            "daily_breakdown": [{"date": x["date"], "label": _fmt(x["date"]), "expected": x["expected"]} for x in daily_forecast],
        },
        "where": {
            "governorate": risk["top_governorate"], "location": risk["top_location"],
            "risk_score": round(risk["top_score"], 3),
            "ranking": risk["ranking"][:5],
        },
        "how_many": {
            "predicted_type": predicted_type,
            "expected_detained_per_incident": round(avg_detained, 1),
            "expected_total_detained": expected_total_detained,
        },
        "reasoning": {
            "endpoint": f"تنتهي البيانات عند آخر سجل في {_fmt(data_end)} — التنبؤ يبدأ من اليوم التالي ويمتد {horizon_days} يوماً",
            "rate": f"المعدل اليومي التاريخي {overall_daily_rate:.2f} حادث/يوم، وآخر 30 يوماً بمعدل {recent_daily_rate:.2f} (معامل الاتجاه {trend_factor:.2f})",
            "seasonal": f"نموذج يومي يجمع تأثير يوم الأسبوع والموسم الشهري — ذروة متوقعة في {_fmt(peak['date'])}",
            "spatial": f"{risk['top_governorate']} هي الأعلى مخاطر بناءً على النشاط الأخير والحصة التاريخية لمحاذاة فترة التنبؤ",
            "type_reason": type_risk["reason"],
        },
    }


def _spatial_risk(incidents, forecast_start, forecast_end):
    now = incidents[-1]["_d"]
    recent_cutoff = now - timedelta(days=90)
    gov_stats = {}
    loc_stats = {}
    for r in incidents:
        recency = 2.0 if r["_d"] >= recent_cutoff else 1.0
        g = r.get("governorate", "غير محدد")
        s = gov_stats.setdefault(g, {"count": 0, "weight": 0, "detained": 0})
        s["count"] += 1; s["weight"] += recency; s["detained"] += r.get("detained_count", 0)
        lk = f"{r.get('governorate','غير محدد')}::{r.get('location_name','غير محدد')}"
        ls = loc_stats.setdefault(lk, {"count": 0, "weight": 0, "governorate": r.get("governorate"), "location": r.get("location_name")})
        ls["count"] += 1; ls["weight"] += recency
    total_weight = sum(s["weight"] for s in gov_stats.values()) or 1

    win_months = set()
    d = forecast_start
    while d <= forecast_end:
        win_months.add(d.month); d += DAY
    month_gov = defaultdict(int); month_total = 0
    for r in incidents:
        if r["_d"].month in win_months:
            g = r.get("governorate", "غير محدد")
            month_gov[g] += 1; month_total += 1
    month_total = month_total or 1

    ranking = []
    for gov, s in gov_stats.items():
        hs = s["weight"] / total_weight
        ss = month_gov.get(gov, 0) / month_total
        ranking.append({"governorate": gov, "score": 0.5*hs + 0.5*ss,
                        "historical_share": round(hs,3), "seasonal_share": round(ss,3),
                        "incidents": s["count"], "detained": s["detained"]})
    ranking.sort(key=lambda x: x["score"], reverse=True)
    top = ranking[0]
    top_loc = None
    for k, ls in loc_stats.items():
        if k.startswith(top["governorate"] + "::"):
            if top_loc is None or ls["weight"] > top_loc["weight"]:
                top_loc = ls
    return {"top_governorate": top["governorate"], "top_score": top["score"],
            "top_location": top_loc["location"] if top_loc else None, "ranking": ranking}


def _type_risk(incidents, forecast_start, forecast_end):
    win_months = set()
    d = forecast_start
    while d <= forecast_end:
        win_months.add(d.month); d += DAY
    counts = {"تهريب": 0, "تسلل": 0}
    for r in incidents:
        if r["_d"].month in win_months:
            counts[r["incident_type"]] = counts.get(r["incident_type"], 0) + 1
    total = counts["تهريب"] + counts["تسلل"] or 1
    top = "تهريب" if counts["تهريب"] >= counts["تسلل"] else "تسلل"
    reason = f"في أشهر فترة التنبؤ تاريخياً، {top} هو الأكثر شيوعاً ({round(counts[top]/total*100)}%)"
    return {"top_type": top, "reason": reason, "month_type_counts": counts}


def _confidence_label(record_count, trend_raw):
    stability = 1 - min(1, abs(trend_raw - 1))
    score = min(1, record_count / 300) * 0.6 + stability * 0.4
    if score > 0.66: return "عالية"
    if score > 0.4: return "متوسطة"
    return "منخفضة"