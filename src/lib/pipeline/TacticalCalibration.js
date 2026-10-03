import { CANDIDATES, makeCandidate, frameMap, blendMaps } from '@/lib/pipeline/tuningCandidates';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
import { rowsToPanel } from '@/lib/pipeline/PanelBuilder';
export const DAY = 86400000;
export const monthDays = mid => { const year = 1960 + Math.floor((mid - 1) / 12), month = (mid - 1) % 12; return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); };
export function tuneMomentum(records, selection, target, end) {
  if (!selection || selection.folds < 3) return { weight: 0, folds: 0, scores: [] };
  const members = selection.members.map(m => CANDIDATES.find(c => c.id === m.id));
  const rows = records.map(r => ({ ...r, month_id: toMonthId(r.incident_date), entity_id: r.governorate || 'unknown' }));
  const last = toMonthId(end), losses = [0, 0.25, 0.5, 0.75].map(weight => ({ weight, errors: [] }));
  let folds = 0;
  for (let origin = last - 7; origin <= last - 2; origin++) {
    const cutoff = Date.UTC(1960 + Math.floor((origin - 1) / 12), (origin - 1) % 12 + 1, 0);
    const train = rows.filter(r => r.month_id <= origin);
    if (train.length < 20) continue;
    const panel = rowsToPanel(train, target);
    const p = blendMaps(members.map(c => frameMap(makeCandidate(c, target, origin + 1, 1, 'cm').fit(panel).predict()[target])), selection.weights);
    const monthly = [...p.values()].reduce((s, v) => s + v, 0);
    const recent = records.filter(r => { const t = Date.parse(r.incident_date); return t <= cutoff && t > cutoff - 30 * DAY; }).reduce((s, r) => s + (target === 'incidents' ? 1 : r.detained_count || 0), 0) / 30;
    for (const horizon of [7, 14, 30]) {
      if (cutoff + horizon * DAY > end.getTime()) continue;
      const actual = records.filter(r => { const t = Date.parse(r.incident_date); return t > cutoff && t <= cutoff + horizon * DAY; }).reduce((s, r) => s + (target === 'incidents' ? 1 : r.detained_count || 0), 0);
      for (const l of losses) l.errors.push(Math.abs(actual - horizon * ((1 - l.weight) * monthly / monthDays(origin + 1) + l.weight * recent)));
    }
    folds++;
  }
  const scores = losses.map(l => ({ weight: l.weight, mae: l.errors.length ? l.errors.reduce((s, v) => s + v, 0) / l.errors.length : null }));
  const best = [...scores].filter(s => s.mae != null).sort((a, b) => a.mae - b.mae)[0];
  return { weight: best?.weight || 0, folds, scores };
}