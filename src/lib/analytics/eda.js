// Exploratory Data Analysis (EDA) module.
// Pure functions - takes an array of incident records, returns structured EDA results.
// Portable: mirrors python_reference/eda.py.

const OMAN_BOUNDS = { latMin: 16.5, latMax: 26.6, lngMin: 51.9, lngMax: 60.0 };

export function runEDA(incidents) {
  return {
    quality: dataQuality(incidents),
    distributions: distributions(incidents),
    seasonality: seasonality(incidents),
    predictors: strongestPredictors(incidents),
    summary: summary(incidents),
  };
}

function dataQuality(incidents) {
  const n = incidents.length;
  const fields = ["incident_id", "incident_date", "location_name", "governorate", "latitude", "longitude", "incident_type", "ethnicity", "detained_count", "details"];
  const missing = {};
  for (const f of fields) {
    missing[f] = incidents.filter((i) => i[f] === null || i[f] === undefined || i[f] === "").length;
  }
  const ids = incidents.map((i) => i.incident_id);
  const duplicateIds = ids.length - new Set(ids).size;
  const invalidCoords = incidents.filter(
    (i) =>
      i.latitude == null || i.longitude == null ||
      i.latitude < OMAN_BOUNDS.latMin || i.latitude > OMAN_BOUNDS.latMax ||
      i.longitude < OMAN_BOUNDS.lngMin || i.longitude > OMAN_BOUNDS.lngMax
  ).length;
  const negativeCounts = incidents.filter((i) => i.detained_count != null && i.detained_count < 0).length;
  const invalidDates = incidents.filter((i) => i.incident_date && isNaN(new Date(i.incident_date).getTime())).length;
  return { totalRecords: n, missing, duplicateIds, invalidCoords, negativeCounts, invalidDates };
}

function distributions(incidents) {
  const counts = incidents.map((i) => i.detained_count).filter((c) => c != null);
  const detainedStats = numericStats(counts);
  const byType = groupCount(incidents, "incident_type");
  const byGovernorate = groupCount(incidents, "governorate");
  const byEthnicity = groupCount(incidents, "ethnicity");
  const detainedByType = groupSum(incidents, "incident_type", "detained_count");
  return { detainedStats, byType, byGovernorate, byEthnicity, detainedByType };
}

function numericStats(arr) {
  if (!arr.length) return { count: 0, min: 0, max: 0, mean: 0, median: 0, std: 0, sum: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  const mean = sum / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { count: arr.length, min: sorted[0], max: sorted[sorted.length - 1], mean: +mean.toFixed(2), median, std: +Math.sqrt(variance).toFixed(2), sum };
}

function groupCount(arr, field) {
  const map = {};
  for (const r of arr) {
    const k = r[field] || "غير محدد";
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function groupSum(arr, field, valueField) {
  const map = {};
  for (const r of arr) {
    const k = r[field] || "غير محدد";
    map[k] = (map[k] || 0) + (r[valueField] || 0);
  }
  return Object.entries(map).map(([key, sum]) => ({ key, sum })).sort((a, b) => b.sum - a.sum);
}

function seasonality(incidents) {
  // Average detained count + incident count per calendar month (1-12)
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, incidents: 0, detained: 0 }));
  for (const r of incidents) {
    if (!r.incident_date) continue;
    const m = new Date(r.incident_date).getMonth() + 1;
    months[m - 1].incidents += 1;
    months[m - 1].detained += r.detained_count || 0;
  }
  // Seasonal strength: variance of monthly means / overall mean
  const incMeans = months.map((m) => m.incidents);
  const incMean = incMeans.reduce((a, b) => a + b, 0) / 12;
  const incVar = incMeans.reduce((a, b) => a + (b - incMean) ** 2, 0) / 12;
  const seasonalStrength = incMean > 0 ? +Math.sqrt(incVar / (incMean * incMean)).toFixed(3) : 0;
  return { months, seasonalStrength };
}

// Correlation ratio (eta squared) for categorical vs numeric - measures how much of
// the detained_count variance is explained by a categorical field.
function correlationRatio(records, catField, numField) {
  const groups = {};
  for (const r of records) {
    const k = r[catField];
    if (k == null) continue;
    if (!groups[k]) groups[k] = [];
    groups[k].push(r[numField] || 0);
  }
  const all = records.map((r) => r[numField] || 0);
  const grandMean = all.reduce((a, b) => a + b, 0) / all.length;
  let between = 0, within = 0;
  for (const k in groups) {
    const g = groups[k];
    const gm = g.reduce((a, b) => a + b, 0) / g.length;
    between += g.length * (gm - grandMean) ** 2;
    within += g.reduce((a, b) => a + (b - gm) ** 2, 0);
  }
  const total = between + within;
  return total > 0 ? +(between / total).toFixed(3) : 0;
}

function strongestPredictors(incidents) {
  const eta2 = (field) => correlationRatio(incidents, field, "detained_count");
  const predictors = [
    { field: "governorate", label: "المحافظة", etaSquared: eta2("governorate") },
    { field: "incident_type", label: "نوع الحادث", etaSquared: eta2("incident_type") },
    { field: "ethnicity", label: "الجنسية", etaSquared: eta2("ethnicity") },
    { field: "location_name", label: "الموقع", etaSquared: eta2("location_name") },
  ].sort((a, b) => b.etaSquared - a.etaSquared);
  return predictors;
}

function summary(incidents) {
  const dates = incidents.map((i) => new Date(i.incident_date)).filter((d) => !isNaN(d));
  const minDate = dates.length ? new Date(Math.min(...dates)) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
  const totalDetained = incidents.reduce((a, b) => a + (b.detained_count || 0), 0);
  const byType = {};
  for (const r of incidents) byType[r.incident_type] = (byType[r.incident_type] || 0) + 1;
  return {
    totalIncidents: incidents.length,
    totalDetained,
    dateRange: { start: minDate, end: maxDate },
    byType,
  };
}