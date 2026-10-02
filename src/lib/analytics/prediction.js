// Next-event predictive analytics.
// Combines the seasonal forecast (when + how many) with a spatial risk model (where).
// Portable: mirrors python_reference/prediction.py.

import { buildMonthlySeries, forecastSeries } from "./forecasting";

// Predict the next likely incident: where (governorate/location), when (date), how many (detained).
export function predictNextEvent(incidents, options = {}) {
  const horizonMonths = options.horizonMonths || 1; // next event within the next month by default
  const monthly = buildMonthlySeries(incidents, "incidents");
  const detainedMonthly = buildMonthlySeries(incidents, "detained");

  // 1. WHEN + HOW MANY (overall) from the forecast
  const incForecast = forecastSeries(monthly, "incidents", 12, 2);
  const detainedForecast = forecastSeries(detainedMonthly, "detained", 12, 2);
  const nextMonth = incForecast.projection[0];
  const nextMonthDetained = detainedForecast.projection[0];

  // 2. WHERE - spatial risk model
  // Score each governorate by recent activity (last 3 months weight) + seasonal alignment + historical share.
  const risk = spatialRisk(incidents, nextMonth);

  // 3. Predicted incident_type for the next event
  const typeRisk = typeRiskModel(incidents, nextMonth);

  // 4. Expected detained count for the next event (per incident average for the predicted type)
  const predictedType = typeRisk.topType;
  const typeRecords = incidents.filter((i) => i.incident_type === predictedType);
  const avgDetainedPerIncident = typeRecords.length
    ? typeRecords.reduce((a, b) => a + (b.detained_count || 0), 0) / typeRecords.length
    : nextMonthDetained.value / Math.max(1, nextMonth.value);

  return {
    when: {
      period: nextMonth.period,
      date: nextMonth.date,
      expectedIncidents: +nextMonth.value.toFixed(1),
      confidence: confidenceLabel(nextMonth.value, incForecast.residStd),
    },
    where: {
      governorate: risk.topGovernorate,
      location: risk.topLocation,
      riskScore: +risk.topScore.toFixed(3),
      ranking: risk.ranking.slice(0, 5),
    },
    howMany: {
      predictedType,
      expectedDetainedPerIncident: +avgDetainedPerIncident.toFixed(1),
      expectedTotalDetained: +nextMonthDetained.value.toFixed(1),
    },
    reasoning: {
      seasonal: `النموذج الموسمي يتنبأ بـ ${nextMonth.value.toFixed(1)} حادث في ${nextMonth.period}`,
      spatial: `${risk.topGovernorate} هي الأعلى مخاطر بناءً على النشاط الأخير والحصة التاريخية`,
      typeReason: typeRisk.reason,
    },
  };
}

function spatialRisk(incidents, nextMonth) {
  // Recent activity: weight incidents in last 90 days higher
  const now = incidents.length ? new Date(Math.max(...incidents.map((i) => new Date(i.incident_date)))) : new Date();
  const recentCutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000);

  const govStats = {};
  const locStats = {};
  for (const r of incidents) {
    if (!r.incident_date) continue;
    const d = new Date(r.incident_date);
    const recencyWeight = d >= recentCutoff ? 2.0 : 1.0;
    const g = r.governorate || "غير محدد";
    if (!govStats[g]) govStats[g] = { count: 0, weight: 0, detained: 0 };
    govStats[g].count += 1;
    govStats[g].weight += recencyWeight;
    govStats[g].detained += r.detained_count || 0;
    const locKey = `${r.governorate || "غير محدد"}::${r.location_name || "غير محدد"}`;
    if (!locStats[locKey]) locStats[locKey] = { count: 0, weight: 0, governorate: r.governorate, location: r.location_name };
    locStats[locKey].count += 1;
    locStats[locKey].weight += recencyWeight;
  }
  const totalWeight = Object.values(govStats).reduce((a, g) => a + g.weight, 0) || 1;
  // Seasonal alignment: boost governorates whose monthly share aligns with the forecast month
  const forecastMonth = nextMonth.date.getMonth() + 1;
  const monthGovCounts = {};
  for (const r of incidents) {
    if (!r.incident_date) continue;
    if (new Date(r.incident_date).getMonth() + 1 === forecastMonth) {
      const g = r.governorate || "غير محدد";
      monthGovCounts[g] = (monthGovCounts[g] || 0) + 1;
    }
  }
  const monthTotal = Object.values(monthGovCounts).reduce((a, b) => a + b, 0) || 1;

  const ranking = Object.entries(govStats).map(([gov, s]) => {
    const historicalShare = s.weight / totalWeight;
    const seasonalShare = (monthGovCounts[gov] || 0) / monthTotal;
    const score = 0.5 * historicalShare + 0.5 * seasonalShare;
    return { governorate: gov, score, historicalShare: +historicalShare.toFixed(3), seasonalShare: +seasonalShare.toFixed(3), incidents: s.count, detained: s.detained };
  }).sort((a, b) => b.score - a.score);

  const topGov = ranking[0];
  // Top location within the top governorate
  const locsInTopGov = Object.entries(locStats).filter(([k]) => k.startsWith(topGov.governorate + "::")).sort((a, b) => b[1].weight - a[1].weight);
  const topLoc = locsInTopGov[0];

  return { topGovernorate: topGov.governorate, topScore: topGov.score, topLocation: topLoc ? topLoc[1].location : null, ranking };
}

function typeRiskModel(incidents, nextMonth) {
  const forecastMonth = nextMonth.date.getMonth() + 1;
  const monthTypeCounts = { "تهريب": 0, "تسلل": 0 };
  for (const r of incidents) {
    if (!r.incident_date) continue;
    if (new Date(r.incident_date).getMonth() + 1 === forecastMonth) {
      monthTypeCounts[r.incident_type] = (monthTypeCounts[r.incident_type] || 0) + 1;
    }
  }
  const total = monthTypeCounts["تهريب"] + monthTypeCounts["تسلل"] || 1;
  const topType = monthTypeCounts["تهريب"] >= monthTypeCounts["تسلل"] ? "تهريب" : "تسلل";
  const reason = `في شهر ${forecastMonth} تاريخياً، ${topType} هو الأكثر شيوعاً (${Math.round((monthTypeCounts[topType] / total) * 100)}%)`;
  return { topType, reason, monthTypeCounts };
}

function confidenceLabel(expected, residStd) {
  const cv = expected > 0 ? residStd / expected : 1;
  if (cv < 0.25) return "عالية";
  if (cv < 0.5) return "متوسطة";
  return "منخفضة";
}