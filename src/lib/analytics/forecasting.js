// Seasonal forecasting using additive Holt-Winters triple exponential smoothing.
// Pure functions - takes a monthly time series, returns a 48-month forecast.
// Portable: mirrors python_reference/forecasting.py.

// Build a monthly series from incidents: returns [{ period: 'YYYY-MM', date, incidents, detained }]
export function buildMonthlySeries(incidents, valueKey = "incidents") {
  const map = {};
  for (const r of incidents) {
    if (!r.incident_date) continue;
    const d = new Date(r.incident_date);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map[period]) map[period] = { period, date: new Date(d.getFullYear(), d.getMonth(), 1), incidents: 0, detained: 0 };
    map[period].incidents += 1;
    map[period].detained += r.detained_count || 0;
  }
  return Object.values(map).sort((a, b) => a.date - b.date);
}

// Additive Holt-Winters with grid-search over smoothing params to minimize SSE.
export function holtWintersAdditive(series, seasonLength = 12, forecastHorizon = 48) {
  const y = series.map((v) => Number(v));
  if (y.length < 2 * seasonLength) {
    // Not enough data for seasonal model - fall back to simple linear trend
    return simpleTrendForecast(y, forecastHorizon);
  }
  // Grid search smoothing params
  let best = { alpha: 0.3, beta: 0.1, gamma: 0.2, sse: Infinity, fit: null, level: 0, trend: 0, seasonals: null, residStd: 0 };
  const grid = [0.1, 0.2, 0.3, 0.5, 0.7];
  for (const alpha of grid) {
    for (const beta of grid) {
      for (const gamma of grid) {
        const res = fitHW(y, seasonLength, alpha, beta, gamma);
        if (res.sse < best.sse) best = { alpha, beta, gamma, sse: res.sse, fit: res.fit, level: res.level, trend: res.trend, seasonals: res.seasonals, residStd: res.residStd };
      }
    }
  }
  // Forecast
  const forecast = [];
  const n = y.length;
  for (let h = 1; h <= forecastHorizon; h++) {
    const seasonalIdx = (n + h - 1) % seasonLength;
    const val = best.level + h * best.trend + best.seasonals[seasonalIdx];
    forecast.push(Math.max(0, val));
  }
  // Confidence interval (approx 80% and 95%) based on residual std, widening with horizon
  const ci = forecast.map((f, h) => {
    const w = best.residStd * Math.sqrt(1 + h * 0.15);
    return { lower80: Math.max(0, f - 1.28 * w), upper80: f + 1.28 * w, lower95: Math.max(0, f - 1.96 * w), upper95: f + 1.96 * w };
  });
  return { forecast, ci, params: { alpha: best.alpha, beta: best.beta, gamma: best.gamma }, sse: best.sse, residStd: best.residStd, fitted: best.fit };
}

function fitHW(y, m, alpha, beta, gamma) {
  // Initialize
  const seasonAverages = [];
  for (let i = 0; i < Math.floor(y.length / m); i++) {
    const slice = y.slice(i * m, (i + 1) * m);
    seasonAverages.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  let level = seasonAverages[0];
  let trend = seasonAverages.length > 1 ? (seasonAverages[1] - seasonAverages[0]) / m : 0;
  const seasonals = [];
  for (let i = 0; i < m; i++) {
    seasonals.push(y[i] - level);
  }
  const fit = [];
  let sse = 0;
  const residuals = [];
  for (let t = 0; t < y.length; t++) {
    const seasonalIdx = t % m;
    const forecast = level + trend + seasonals[seasonalIdx];
    const fitted = Math.max(0, forecast);
    fit.push(fitted);
    const err = y[t] - fitted;
    residuals.push(err);
    sse += err * err;
    const newLevel = alpha * (y[t] - seasonals[seasonalIdx]) + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    seasonals[seasonalIdx] = gamma * (y[t] - newLevel) + (1 - gamma) * seasonals[seasonalIdx];
    level = newLevel;
    trend = newTrend;
  }
  const residStd = Math.sqrt(sse / y.length);
  return { fit, sse, level, trend, seasonals, residStd };
}

function simpleTrendForecast(y, horizon) {
  const n = y.length;
  const mean = y.reduce((a, b) => a + b, 0) / n;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += y[i]; sumXY += i * y[i]; sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  const forecast = [];
  for (let h = 1; h <= horizon; h++) forecast.push(Math.max(0, intercept + slope * (n + h - 1)));
  const residStd = Math.sqrt(y.reduce((a, v, i) => a + (v - (intercept + slope * i)) ** 2, 0) / n);
  const ci = forecast.map((f, h) => {
    const w = residStd * Math.sqrt(1 + h * 0.15);
    return { lower80: Math.max(0, f - 1.28 * w), upper80: f + 1.28 * w, lower95: Math.max(0, f - 1.96 * w), upper95: f + 1.96 * w };
  });
  return { forecast, ci, params: { method: "linear_trend" }, sse: 0, residStd, fitted: y.map((v, i) => intercept + slope * i) };
}

// Full forecast for a series: historical + 48-month projection with period labels
export function forecastSeries(monthlySeries, valueKey, seasonLength = 12, horizon = 48) {
  const values = monthlySeries.map((m) => m[valueKey]);
  const result = holtWintersAdditive(values, seasonLength, horizon);
  const lastDate = monthlySeries[monthlySeries.length - 1].date;
  const projection = result.forecast.map((val, h) => {
    const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + h + 1, 1);
    return {
      period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      date: d,
      value: +val.toFixed(2),
      lower80: +result.ci[h].lower80.toFixed(2),
      upper80: +result.ci[h].upper80.toFixed(2),
      lower95: +result.ci[h].lower95.toFixed(2),
      upper95: +result.ci[h].upper95.toFixed(2),
    };
  });
  return { projection, params: result.params, residStd: +result.residStd.toFixed(3), fitted: result.fitted };
}