export const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
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