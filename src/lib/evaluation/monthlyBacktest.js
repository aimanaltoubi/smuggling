import AutoTunedModel from '@/lib/pipeline/AutoTunedModel';
import { frameMap } from '@/lib/pipeline/tuningCandidates';
import { rowsToPanel } from '@/lib/pipeline/PanelBuilder';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
import { metrics, mean, pairedImprovement } from '@/lib/evaluation/metrics';
export const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export function observedPanel(records, end) {
  const panel = rowsToPanel(records.map(r => ({ ...r, entity_id: r.governorate, month_id: toMonthId(r.incident_date) })));
  const last = Math.max(...panel.cells.map(c => c.month_id));
  for (const entity_id of new Set(panel.cells.map(c => c.entity_id))) for (let month_id = last + 1; month_id <= end; month_id++) panel.cells.push({ month_id, entity_id, incidents: 0, detained_count: 0 });
  return panel;
}
export default async function monthlyBacktest(records, target, observedEnd, onProgress) {
  const mids = records.map(r => toMonthId(r.incident_date)), first = Math.min(...mids);
  const origins = [];
  for (let m = first + 23; m <= observedEnd - 6; m += 3) origins.push(m);
  const selectedOrigins = origins.slice(-6), rows = [], spatial = [];
  let selection = null;
  for (const origin of selectedOrigins) {
    onProgress(`تقييم ${target}، نقطة الرصد ${origin}`); await pause();
    const trainRecords = records.filter(r => toMonthId(r.incident_date) <= origin), train = observedPanel(trainRecords, origin);
    const model = new AutoTunedModel({ targets: [target], partition: { test_start: origin + 1, output_length: 6 }, loa: 'cm' }).fit(train);
    selection = model.selection;
    const p = frameMap(model.predict()[target]);
    // Fixed, transparent seasonal-naive baseline; never chosen from test results.
    const monthly = new Map();
    for (const c of train.cells) monthly.set(c.month_id, (monthly.get(c.month_id) || 0) + c[target]);
    const history = [...monthly].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const scale = mean(history.slice(12).map((v, i) => Math.abs(v - history[i]))) || 0;
    for (const horizon of [1, 3, 6]) {
      const mid = origin + horizon, actualRecords = records.filter(r => toMonthId(r.incident_date) === mid);
      const actual = actualRecords.reduce((s, r) => s + (target === 'incidents' ? 1 : r.detained_count), 0);
      const predicted = [...p].filter(([key]) => +key.split('::')[0] === mid).reduce((s, [, v]) => s + v, 0);
      const radius = selection.radii[horizon];
      rows.push({ origin, horizon, actual, predicted, baseline: monthly.get(mid - 12) || 0, scale, lower: radius == null ? null : Math.max(0, predicted - radius), upper: radius == null ? null : predicted + radius });
      const actualGov = new Map(); for (const r of actualRecords) actualGov.set(r.governorate, (actualGov.get(r.governorate) || 0) + (target === 'incidents' ? 1 : r.detained_count));
      const ranked = [...p].filter(([key]) => +key.split('::')[0] === mid).map(([key, value]) => [key.split('::')[1], value]).sort((a, b) => b[1] - a[1]);
      const actualRank = [...actualGov].sort((a, b) => b[1] - a[1]);
      if (actualRank.length) {
        const max = actualRank[0][1], top = actualRank.filter(([, v]) => v === max).map(([g]) => g);
        spatial.push({ origin, horizon, top1: +(top.includes(ranked[0]?.[0])), top3: actualRank.slice(0, 3).filter(([g]) => ranked.slice(0, 3).some(([pGov]) => pGov === g)).length / Math.min(3, actualRank.length) });
      }
    }
  }
  const byHorizon = [1, 3, 6].map(horizon => { const subset = rows.filter(r => r.horizon === horizon); return { horizon, ...metrics(subset), evidence: pairedImprovement(subset) }; });
  return { target, rows, byHorizon, selection, origins: selectedOrigins, summary: metrics(rows), spatial: { n: spatial.length, top1: spatial.length ? mean(spatial.map(r => r.top1)) * 100 : null, top3: spatial.length ? mean(spatial.map(r => r.top3)) * 100 : null }, error: selectedOrigins.length ? null : 'تحتاج البيانات إلى 30 شهراً مكتملة على الأقل للتقييم المتداخل' };
}