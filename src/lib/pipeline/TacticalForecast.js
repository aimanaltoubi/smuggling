import { runPipeline } from '@/lib/pipeline/pipeline';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
import { tuneMomentum, DAY, monthDays } from '@/lib/pipeline/TacticalCalibration';
const label = d => d.toLocaleDateString('ar-OM', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
export default function TacticalForecast(incidents, opts = {}) {
  const horizonDays = opts.horizonDays || 14, model_name = opts.model_name || 'AutoTunedModel';
  const valid = incidents.filter(r => r.incident_date && Number.isFinite(Date.parse(r.incident_date))).sort((a, b) => a.incident_date.localeCompare(b.incident_date));
  if (valid.length < 2) return null;
  const end = opts.observationEnd ? new Date(opts.observationEnd) : new Date(valid.at(-1).incident_date), first = new Date(valid[0].incident_date);
  const observed = valid.filter(r => Date.parse(r.incident_date) <= end.getTime());
  const mid = toMonthId(end), completed = end.getUTCDate() === monthDays(mid);
  const train = observed.filter(r => toMonthId(r.incident_date) <= (completed ? mid : mid - 1));
  if (train.length < 2 || new Set(train.map(r => toMonthId(r.incident_date))).size < 3) return null;
  const result = target => runPipeline(train, { model_name, target, level: 'governorate', horizon_months: Math.ceil(horizonDays / 28) + 2, report: false });
  const incResult = result('incidents'), detResult = result('detained_count');
  const incTune = tuneMomentum(observed, incResult.forecast.selection, 'incidents', end), detTune = tuneMomentum(observed, detResult.forecast.selection, 'detained_count', end);
  const mw = opts.momentumWeight ?? incTune.weight, dw = opts.momentumWeight ?? detTune.weight;
  const recent = observed.filter(r => Date.parse(r.incident_date) > end.getTime() - 30 * DAY);
  const govs = [...new Set(observed.map(r => r.governorate || 'unknown'))];
  const incMap = new Map(incResult.forecast.projections.map(p => [`${p.month_id}::${p.entity_id}`, p.value]));
  const detMap = new Map(detResult.forecast.projections.map(p => [`${p.month_id}::${p.entity_id}`, p.value]));
  const recentRate = recent.length / 30, recentDetRate = recent.reduce((s, r) => s + (r.detained_count || 0), 0) / 30;
  const govRecent = new Map(govs.map(g => [g, recent.filter(r => (r.governorate || 'unknown') === g).length / 30]));
  const daily = [], govTotals = new Map(govs.map(g => [g, 0]));
  let detTotal = 0, pipeTotal = 0, detPipeTotal = 0;
  for (let h = 1; h <= horizonDays; h++) {
    const date = new Date(end.getTime() + h * DAY), m = toMonthId(date), days = monthDays(m);
    let expected = 0, pipe = 0, detPipe = 0;
    for (const g of govs) {
      const rate = (incMap.get(`${m}::${g}`) || 0) / days, blended = (1 - mw) * rate + mw * govRecent.get(g);
      pipe += rate; expected += blended; detPipe += (detMap.get(`${m}::${g}`) || 0) / days;
      govTotals.set(g, govTotals.get(g) + blended);
    }
    pipeTotal += pipe; detPipeTotal += detPipe; detTotal += (1 - dw) * detPipe + dw * recentDetRate;
    daily.push({ date, label: label(date), expected, detained: (1 - dw) * detPipe + dw * recentDetRate });
  }
  const ranking = [...govTotals].map(([governorate, rawScore]) => ({ governorate, rawScore, score: rawScore / Math.max(1e-9, [...govTotals.values()].reduce((s, v) => s + v, 0)), incidents: observed.filter(r => r.governorate === governorate).length, detained: observed.filter(r => r.governorate === governorate).reduce((s, r) => s + (r.detained_count || 0), 0) })).sort((a, b) => b.rawScore - a.rawScore);
  const total = daily.reduce((s, r) => s + r.expected, 0), peak = daily.reduce((a, b) => a.expected >= b.expected ? a : b), topGov = ranking[0]?.governorate;
  const types = recent.length ? recent : observed, smuggling = types.filter(r => r.incident_type === 'تهريب').length, predictedType = smuggling >= types.length / 2 ? 'تهريب' : 'تسلل';
  return {
    dataEndpoint: { lastDate: end, lastDateLabel: label(end), firstDateLabel: label(first), totalRecords: observed.length, daysSpanned: Math.round((end - first) / DAY) + 1 },
    forecastWindow: { start: daily[0].date, end: daily.at(-1).date, days: horizonDays, startLabel: daily[0].label, endLabel: daily.at(-1).label },
    model: { pipelineModel: model_name, source: 'MLOps + temporal model selection', monthlyRate: pipeTotal / horizonDays * 30, dailyRate: total / horizonDays, pipelineDailyRate: pipeTotal / horizonDays, recentDailyRate: recentRate, detPipelineDailyRate: detPipeTotal / horizonDays, recentDetDailyRate: recentDetRate, momentumWeight: mw, detainedMomentumWeight: dw, overallDailyRate: observed.length / (Math.round((end - first) / DAY) + 1), trendFactor: 1, ensemble: incResult.forecast.selection, tacticalTuning: { incidents: incTune, detained: detTune } },
    when: { totalExpectedIncidents: total, peakDay: peak, dailyBreakdown: daily },
    where: { governorate: topGov, location: observed.filter(r => r.governorate === topGov).at(-1)?.location_name || null, riskScore: ranking[0]?.score || 0, ranking: ranking.slice(0, 5) },
    howMany: { predictedType, expectedTotalDetained: detTotal, expectedDetainedPerIncident: total > 0 ? detTotal / total : 0 },
    reasoning: { endpoint: `التنبؤ يبدأ بعد نهاية الرصد في ${label(end)}، لا بعد آخر حادث تلقائياً عند تحديد نهاية الرصد`, rate: 'معدلات شهرية مقسومة على عدد أيام الشهر الفعلي، مع وزن حديث مضبوط لكل هدف', seasonal: `اختيار زمني للمكونات: ${incResult.forecast.selection?.members.map(m => m.id).join(' + ') || model_name}`, spatial: 'ترتيب المحافظات حسب العدد المتوقع خلال نفس نافذة الأيام، وليس احتمال وقوع حادث مؤكد', typeReason: 'نوع مرجح من التوزيع الحديث، وليس ضماناً لنوع الحادث القادم' },
    pipeline: { incResult, detResult },
  };
}