const rounded = value => Number.isFinite(value) ? +value.toFixed(2) : null;
const average = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

function correlation(values, lag) {
  if (values.length - lag < 3) return null;
  const first = values.slice(0, -lag);
  const second = values.slice(lag);
  const firstMean = average(first);
  const secondMean = average(second);
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index++) {
    covariance += (first[index] - firstMean) * (second[index] - secondMean);
    firstVariance += (first[index] - firstMean) ** 2;
    secondVariance += (second[index] - secondMean) ** 2;
  }
  return firstVariance > 1e-12 && secondVariance > 1e-12 ? rounded(covariance / Math.sqrt(firstVariance * secondVariance)) : null;
}

export function analyzeSeries(rows) {
  const series = rows.filter(row => Number.isFinite(row.value));
  const values = series.map(row => row.value);
  if (!values.length) return { count: 0 };
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  const midpoint = (values.length - 1) / 2;
  const denominator = values.reduce((total, value, index) => total + (index - midpoint) ** 2, 0);
  const slope = denominator ? values.reduce((total, value, index) => total + (index - midpoint) * (value - mean), 0) / denominator : 0;
  const residuals = values.map((value, index) => value - mean - slope * (index - midpoint));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const recent = values.slice(-3);
  const previous = values.length >= 6 ? values.slice(-6, -3) : [];
  let repeatedLag = null;
  for (let lag = 2; lag <= Math.min(6, Math.floor(values.length / 3)); lag++) {
    if (correlation(residuals, lag) >= 0.8) { repeatedLag = lag; break; }
  }
  const annualCorrelation = values.length >= 24 ? correlation(residuals, 12) : null;
  const changes = series.slice(1).map((row, index) => ({ from: series[index].label, to: row.label, change: rounded(row.value - series[index].value) }));
  return {
    count: values.length, start: series[0].label, end: series.at(-1).label,
    total: rounded(values.reduce((total, value) => total + value, 0)), mean: rounded(mean), minimum, maximum,
    zeroPeriods: values.filter(value => value === 0).length,
    zeroSharePercent: rounded(values.filter(value => value === 0).length / values.length * 100),
    standardDeviation: rounded(Math.sqrt(variance)), coefficientOfVariationPercent: mean > 0 ? rounded(Math.sqrt(variance) / mean * 100) : null,
    descriptiveMonthlySlope: values.length >= 3 ? rounded(slope) : null,
    recentMean: rounded(average(recent)), previousMean: rounded(average(previous)),
    recentChange: previous.length ? rounded(average(recent) - average(previous)) : null,
    recentChangePercent: previous.length && average(previous) > 0 ? rounded((average(recent) / average(previous) - 1) * 100) : null,
    repeatedLag, annualCorrelation,
    annualPattern: values.length < 24 ? "insufficient-history" : repeatedLag ? "shorter-cycle-recurrence" : annualCorrelation >= 0.6 ? "descriptive-recurrence" : "not-detected",
    peakPeriods: series.filter(row => row.value === maximum).slice(0, 12).map(row => row.label),
    largestStep: changes.sort((first, second) => Math.abs(second.change) - Math.abs(first.change))[0] || null,
  };
}

export function prepareAnalysisFacts(facts) {
  const detainedTarget = /معتقل|detained/i.test(facts.target || "");
  const history = (facts.observedEvidence?.recentMonthlyObserved || facts.recentMonthlyActuals || []).map(month => ({
    label: month.label || month.period,
    value: month[detainedTarget ? "detained" : "incidents"] ?? month.actual,
  }));
  const forecast = (facts.projectedMonthlyValues || facts.dailyIncidentForecast || []).map(period => ({ label: period.period || period.date, value: period.value ?? period.expectedIncidents }));
  const historical = analyzeSeries(history);
  const projected = analyzeSeries(forecast);
  const historicalValues = history.map(row => row.value).filter(Number.isFinite);
  const projectedValues = forecast.map(row => row.value).filter(Number.isFinite);
  const historicalMean = average(historicalValues);
  const projectedMean = average(projectedValues);
  const recentMean = average(historicalValues.slice(-3));
  const monthlyForecast = Array.isArray(facts.projectedMonthlyValues);
  const comparableRecentMean = monthlyForecast ? recentMean : Number.isFinite(facts.recentDailyRate) ? facts.recentDailyRate : null;
  const years = new Map();
  for (const month of facts.projectedMonthlyValues || []) {
    if (!Number.isFinite(month.value) || typeof month.period !== "string" || !/^\d{4}-\d{2}$/.test(month.period)) continue;
    const year = month.period.slice(0, 4);
    years.set(year, (years.get(year) || 0) + month.value);
  }
  const intervalWidths = (facts.projectedMonthlyValues || []).filter(month => Number.isFinite(month.experimentalLower80) && Number.isFinite(month.experimentalUpper80) && month.experimentalUpper80 >= month.experimentalLower80)
    .map(month => ({ label: month.period, width: month.experimentalUpper80 - month.experimentalLower80 }));
  return {
    ...facts,
    computedAnalysis: {
      historical,
      projected,
      forecastUnit: monthlyForecast ? "month" : "day",
      forecastVsHistoricalChange: monthlyForecast && historical.count && projected.count ? rounded(projectedMean - historicalMean) : null,
      forecastVsHistoricalPercent: monthlyForecast && historicalMean > 0 && projected.count ? rounded((projectedMean / historicalMean - 1) * 100) : null,
      forecastVsRecentChange: comparableRecentMean != null && projected.count ? rounded(projectedMean - comparableRecentMean) : null,
      recentComparisonMean: rounded(comparableRecentMean),
      matchesRecentMean: Boolean(comparableRecentMean != null && projected.count && Math.abs(projectedMean - comparableRecentMean) < 0.02),
      yearlyTotals: [...years].map(([year, total]) => ({ year, total: rounded(total) })),
      intervalWidths: analyzeSeries(intervalWidths.map(interval => ({ label: interval.label, value: interval.width }))),
      interpretation: "Descriptive statistics, not significance tests or causal evidence; zero periods follow the model's reporting-window assumption.",
    },
  };
}