import TacticalForecast from '@/lib/pipeline/TacticalForecast';
import { DAY } from '@/lib/pipeline/TacticalCalibration';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
import { metrics } from '@/lib/evaluation/metrics';
import { pause } from '@/lib/evaluation/monthlyBacktest';
export default async function tacticalBacktest(records, origins, onProgress) {
  const rows = [];
  for (const origin of origins.slice(-4)) {
    onProgress('اختبار نوافذ 7 و14 و30 يوماً'); await pause();
    const cutoff = new Date(Date.UTC(1960 + Math.floor((origin - 1) / 12), (origin - 1) % 12 + 1, 0));
    const train = records.filter(r => toMonthId(r.incident_date) <= origin);
    const p = TacticalForecast(train, { horizonDays: 30, observationEnd: cutoff });
    if (!p) continue;
    const recent = train.filter(r => Date.parse(r.incident_date) > cutoff.getTime() - 30 * DAY);
    for (const horizon of [7, 14, 30]) {
      const actual = records.filter(r => { const t = Date.parse(r.incident_date); return t > cutoff.getTime() && t <= cutoff.getTime() + horizon * DAY; });
      const predicted = p.when.dailyBreakdown.slice(0, horizon).reduce((s, r) => s + r.expected, 0);
      rows.push({ origin, horizon, target: 'incidents', actual: actual.length, predicted, baseline: recent.length / 30 * horizon, scale: 0 });
      // Detained horizon prediction follows daily calendar rates, not a monthly-vs-daily comparison.
      const detainedPrediction = p.when.dailyBreakdown.slice(0, horizon).reduce((s, r) => s + r.detained, 0);
      rows.push({ origin, horizon, target: 'detained_count', actual: actual.reduce((s, r) => s + r.detained_count, 0), predicted: detainedPrediction, baseline: recent.reduce((s, r) => s + r.detained_count, 0) / 30 * horizon, scale: 0 });
    }
  }
  return ['incidents', 'detained_count'].flatMap(target => [7, 14, 30].map(horizon => ({ target, horizon, ...metrics(rows.filter(r => r.target === target && r.horizon === horizon)) })));
}