import dataAudit from '@/lib/evaluation/dataAudit';
import monthlyBacktest from '@/lib/evaluation/monthlyBacktest';
import tacticalBacktest from '@/lib/evaluation/tacticalBacktest';
import { stressDatasets } from '@/lib/evaluation/stressScenarios';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';

export async function runComprehensiveEvaluation({ incidents = [], source = 'real', onProgress = () => {} } = {}) {
  const audit = dataAudit(incidents);
  const datasets = source === 'stress' ? stressDatasets() : [{ name: 'البيانات المحملة', records: audit.rows, observedEnd: audit.rows.length ? toMonthId(audit.rows.at(-1).incident_date) - 1 : 0 }];
  const reports = [], tactical = [];
  for (const dataset of datasets) {
    const types = source === 'real' ? ['all', 'تهريب', 'تسلل'] : ['all'];
    for (const type of types) {
      const records = dataset.records.filter(r => (type === 'all' || r.incident_type === type) && toMonthId(r.incident_date) <= dataset.observedEnd);
      if (!records.length) { reports.push({ name: dataset.name, type, target: 'incidents', error: 'لا توجد بيانات صالحة', byHorizon: [], rows: [] }); continue; }
      for (const target of ['incidents', 'detained_count']) {
        const report = await monthlyBacktest(records, target, dataset.observedEnd, text => onProgress(`${dataset.name} / ${type}: ${text}`));
        reports.push({ ...report, name: dataset.name, type });
        if (type === 'all' && target === 'incidents' && report.origins.length) tactical.push({ name: dataset.name, results: await tacticalBacktest(records, report.origins, onProgress) });
      }
    }
  }
  const evaluated = reports.flatMap(r => r.byHorizon || []).filter(r => r.n > 0);
  const supported = evaluated.filter(r => r.evidence.supported).length;
  const verdict = source === 'stress' ? 'اختبار اصطناعي للمتانة، لا يثبت موثوقية تشغيلية' : supported === evaluated.length && evaluated.length > 0 ? 'تفوق مدعوم على خط الأساس في النوافذ المقاسة، يحتاج تحققاً مستقبلياً' : 'الأدلة غير كافية لإثبات تفوق ثابت، لا تعتمد على التوقعات وحدها';
  return { source, audit: audit.summary, reports, tactical, verdict, supported, evaluated: evaluated.length, completedAt: new Date().toISOString(), methodology: 'ضبط داخلي متحرك ثم اختبار خارجي لم يُستخدم للاختيار، آخر 6 أشهر اختبار نهائي. لا تُضبط المعلمات على نتائج الاختبار.' };
}
export const runFullEvaluation = runComprehensiveEvaluation;