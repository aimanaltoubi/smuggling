import { panelByEntity } from '@/lib/pipeline/PanelBuilder';

const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
function features(history, mid, set) {
  const lag = n => history[history.length - n] || 0;
  const f = [1, lag(1), mean(history.slice(-3))];
  if (set !== 'recent') f.push(lag(12), Math.sin(2 * Math.PI * (mid - 1) / 12), Math.cos(2 * Math.PI * (mid - 1) / 12));
  if (set === 'trend') f.push(mean(history.slice(-3)) - mean(history.slice(-6, -3)));
  return f;
}
function solve(a, b) {
  const m = a.map((r, i) => [...r, b[i]]), n = b.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k];
    if (Math.abs(d) < 1e-12) throw new Error('Singular ridge system');
    for (let j = k; j <= n; j++) m[k][j] /= d;
    for (let i = 0; i < n; i++) if (i !== k) {
      const v = m[i][k];
      for (let j = k; j <= n; j++) m[i][j] -= v * m[k][j];
    }
  }
  return m.map(r => r[n]);
}
export default class LagRidgeModel {
  constructor({ targets, partition, loa, featureSet = 'seasonal', ridge = 10 }) { Object.assign(this, { targets, partition, loa, featureSet, ridge }); }
  fit(panel) {
    this.series = [...panelByEntity(panel)].map(([id, rows]) => ({ id, rows: rows.filter(r => r.month_id < this.partition.test_start) }));
    const samples = [];
    for (const { rows } of this.series) for (let i = 12; i < rows.length; i++) {
      samples.push({ x: features(rows.slice(0, i).map(r => r[this.targets[0]] || 0), rows[i].month_id, this.featureSet), y: rows[i][this.targets[0]] || 0 });
    }
    this.weights = null;
    if (!samples.length) return this;
    const n = samples[0].x.length;
    this.mu = Array.from({ length: n }, (_, j) => j ? mean(samples.map(s => s.x[j])) : 0);
    this.sd = this.mu.map((m, j) => j ? Math.max(1e-6, Math.sqrt(mean(samples.map(s => (s.x[j] - m) ** 2)))) : 1);
    const a = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? (i ? this.ridge : 1e-8) : 0)), b = Array(n).fill(0);
    for (const s of samples) { const x = s.x.map((v, j) => (v - this.mu[j]) / this.sd[j]); for (let i = 0; i < n; i++) { b[i] += x[i] * s.y; for (let j = 0; j < n; j++) a[i][j] += x[i] * x[j]; } }
    this.weights = solve(a, b);
    return this;
  }
  predict() {
    const time = [], unit = [], y_pred = [], target = this.targets[0];
    for (const { id, rows } of this.series) {
      const history = rows.map(r => r[target] || 0);
      for (let h = 0; h < (this.partition.output_length || 1); h++) {
        const mid = this.partition.test_start + h, x = features(history, mid, this.featureSet);
        const val = Math.max(0, this.weights ? x.reduce((s, v, j) => s + this.weights[j] * (v - this.mu[j]) / this.sd[j], 0) : mean(history.slice(-3)));
        time.push(mid); unit.push(id); y_pred.push([val]); history.push(val);
      }
    }
    return { [target]: { time, unit, y_pred, level: this.loa, target } };
  }
}