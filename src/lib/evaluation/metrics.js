export const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = value => new Date(value).toISOString().slice(0, 10);

export function buildDailyTrainingHistory(records, cutoff, target) {
  const end = new Date(cutoff);
  end.setUTCHours(0, 0, 0, 0);
  const start = records.reduce((earliest, record) => {
    const time = Date.parse(record.incident_date);
    return Number.isFinite(time) ? Math.min(earliest, time) : earliest;
  }, Infinity);
  if (!Number.isFinite(start) || start > end.getTime()) return [];
  const daily = new Map();
  for (const record of records) {
    const time = Date.parse(record.incident_date);
    if (!Number.isFinite(time) || time > end.getTime()) continue;
    const key = dayKey(time);
    daily.set(key, (daily.get(key) || 0) + (target === 'incidents' ? 1 : Number(record.detained_count) || 0));
  }
  const values = [];
  for (let time = new Date(start).setUTCHours(0, 0, 0, 0); time <= end.getTime(); time += DAY_MS) values.push(daily.get(dayKey(time)) || 0);
  return values;
}

export function seasonalNaiveScale(values, lag = 1) {
  if (!Array.isArray(values) || !Number.isInteger(lag) || lag < 1 || values.length <= lag) return null;
  const differences = values.slice(lag).map((value, index) => Math.abs(value - values[index]));
  const scale = mean(differences.filter(Number.isFinite));
  return scale > 0 ? scale : null;
}

export function horizonNaiveScale(values, horizon) {
  if (!Array.isArray(values) || !Number.isInteger(horizon) || horizon < 1) return null;
  const windows = [];
  for (let start = 0; start + horizon <= values.length; start += horizon) {
    windows.push(values.slice(start, start + horizon).reduce((total, value) => total + value, 0));
  }
  return seasonalNaiveScale(windows);
}

export function metrics(rows) {
  if (!rows.length) return { n: 0 };
  const errors = rows.map(r => r.predicted - r.actual), abs = errors.map(Math.abs);
  const total = rows.reduce((s, r) => s + r.actual, 0);
  return { n: rows.length, mae: mean(abs), rmse: Math.sqrt(mean(errors.map(e => e * e))), bias: mean(errors),
    wape: total ? 100 * abs.reduce((s, v) => s + v, 0) / total : null,
    mase: mean(rows.filter(r => r.scale > 0).map(r => Math.abs(r.actual - r.predicted) / r.scale)),
    skill: rows.reduce((s, r) => s + Math.abs(r.actual - r.baseline), 0) > 0 ? 100 * (1 - abs.reduce((s, v) => s + v, 0) / rows.reduce((s, r) => s + Math.abs(r.actual - r.baseline), 0)) : null,
    coverage: rows.some(r => r.lower != null) ? mean(rows.filter(r => r.lower != null).map(r => +(r.actual >= r.lower && r.actual <= r.upper))) * 100 : null,
  };
}
// Fold-level paired bootstrap: resample origins, not correlated horizon/entity rows.
export function pairedImprovement(rows) {
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.origin)) groups.set(r.origin, []); groups.get(r.origin).push(r); }
  const pairs = [...groups.values()].map(g => mean(g.map(r => Math.abs(r.actual - r.baseline) - Math.abs(r.actual - r.predicted))));
  if (pairs.length < 4) return { origins: pairs.length, lower: null, upper: null, supported: false };
  let state = 42;
  const draws = Array.from({ length: 500 }, () => mean(pairs.map(() => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return pairs[Math.floor(state / 4294967296 * pairs.length)]; }))).sort((a, b) => a - b);
  return { origins: pairs.length, lower: draws[12], upper: draws[487], supported: draws[12] > 0 };
}