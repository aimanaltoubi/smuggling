import { CANDIDATES, makeCandidate, frameMap, blendMaps } from '@/lib/pipeline/tuningCandidates';
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
function score(folds, maps, target) {
  return mean(folds.map((f, k) => {
    const scale = Math.max(1, mean(f.train.cells.map(c => c[target] || 0)));
    return mean([1, 3, 6].map(h => {
      const cells = f.actual.filter(c => c.month_id === f.origin + h), p = maps[k];
      const actual = cells.reduce((s, c) => s + (c[target] || 0), 0);
      const predicted = [...p].filter(([key]) => +key.split('::')[0] === f.origin + h).reduce((s, [, v]) => s + v, 0);
      return 0.5 * Math.abs(actual - predicted) / Math.max(1, scale * cells.length) + 0.5 * mean(cells.map(c => Math.abs((c[target] || 0) - (p.get(`${c.month_id}::${c.entity_id}`) || 0)) / scale));
    }));
  }));
}
export default class AutoTunedModel {
  constructor({ targets, partition, loa }) { Object.assign(this, { targets, partition, loa }); }
  fit(panel) {
    const target = this.targets[0], cells = panel.cells.filter(c => c.month_id < this.partition.test_start);
    const first = Math.min(...cells.map(c => c.month_id)), last = Math.max(...cells.map(c => c.month_id));
    const folds = [];
    for (let origin = Math.max(first + 17, last - 21); origin <= last - 6; origin += 3) {
      folds.push({ origin, train: { cells: cells.filter(c => c.month_id <= origin) }, actual: cells.filter(c => c.month_id > origin && c.month_id <= origin + 6) });
    }
    const ranked = CANDIDATES.map(c => {
      const maps = folds.map(f => frameMap(makeCandidate(c, target, f.origin + 1, 6, this.loa).fit(f.train).predict()[target]));
      return { c, maps, score: folds.length ? score(folds, maps, target) : (c.id === 'recent-3' ? 0 : Infinity) };
    }).sort((a, b) => a.score - b.score);
    const baseline = ranked.filter(r => ['recent-3', 'seasonal-24', 'last'].includes(r.c.id)).sort((a, b) => a.score - b.score)[0];
    const best = ranked[0], members = ranked.slice(0, 3);
    const combinations = [ { members: [best], weights: [1], score: best.score, method: 'single' } ];
    if (folds.length >= 3) for (const method of ['equal', 'inverse-error']) {
      const w = members.map(r => method === 'equal' ? 1 : 1 / Math.max(0.05, r.score)), total = w.reduce((s, v) => s + v, 0), weights = w.map(v => v / total);
      combinations.push({ members, weights, method, score: score(folds, folds.map((_, k) => blendMaps(members.map(r => r.maps[k]), weights)), target) });
    }
    const proposed = combinations.sort((a, b) => a.score - b.score)[0];
    const chosen = proposed.score < baseline.score * 0.98 ? proposed : { members: [baseline], weights: [1], score: baseline.score, method: 'baseline-retained' };
    this.models = chosen.members.map(r => makeCandidate(r.c, target, this.partition.test_start, this.partition.output_length, this.loa).fit({ cells }));
    this.weights = chosen.weights;
    const radii = {};
    for (let h = 1; h <= 6; h++) {
      const residuals = folds.map((f, k) => {
        const p = blendMaps(chosen.members.map(r => r.maps[k]), chosen.weights);
        const actual = f.actual.filter(c => c.month_id === f.origin + h).reduce((s, c) => s + c[target], 0);
        const predicted = [...p].filter(([key]) => +key.split('::')[0] === f.origin + h).reduce((s, [, v]) => s + v, 0);
        return Math.abs(actual - predicted);
      }).sort((a, b) => a - b);
      radii[h] = residuals.length >= 4 ? residuals[Math.min(residuals.length - 1, Math.ceil((residuals.length + 1) * 0.8) - 1)] : null;
    }
    this.selection = { members: chosen.members.map(r => ({ id: r.c.id, predictors: r.c.predictors, parameters: r.c.hp })), weights: chosen.weights, method: chosen.method, score: Number.isFinite(chosen.score) ? chosen.score : null, baseline: baseline.c.id, folds: folds.length, radii, leaderboard: ranked.map(r => ({ id: r.c.id, predictors: r.c.predictors, score: Number.isFinite(r.score) ? r.score : null })), note: 'نطاقات 80% تجريبية من أخطاء التحقق الداخلي، تغطيتها ليست مضمونة' };
    return this;
  }
  predict() {
    const target = this.targets[0], frames = this.models.map(m => m.predict()[target]);
    const map = blendMaps(frames.map(frameMap), this.weights), frame = frames[0];
    return { [target]: { ...frame, y_pred: frame.time.map((mid, i) => [map.get(`${mid}::${frame.unit[i]}`) || 0]) } };
  }
}