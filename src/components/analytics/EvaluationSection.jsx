import React, { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { runComprehensiveEvaluation } from '@/lib/evaluation/evaluator';
import EvaluationProtocol from '@/components/analytics/EvaluationProtocol';
import EvaluationMetricsTable from '@/components/analytics/EvaluationMetricsTable';
import EvaluationSelection from '@/components/analytics/EvaluationSelection';
import EvaluationTactical from '@/components/analytics/EvaluationTactical';
import EvaluationSources from '@/components/analytics/EvaluationSources';

export default function EvaluationSection({ incidents = [] }) {
  const [evaluation, setEvaluation] = useState(null), [running, setRunning] = useState(false);
  const [source, setSource] = useState('real'), [progress, setProgress] = useState(''), [error, setError] = useState(''), [selected, setSelected] = useState(0);
  useEffect(() => { setEvaluation(null); setSelected(0); }, [incidents]);
  const run = async () => {
    setRunning(true); setError(''); setEvaluation(null); setSelected(0);
    try { setEvaluation(await runComprehensiveEvaluation({ incidents, source, onProgress: setProgress })); }
    catch (e) { setError(e.message || 'تعذر إكمال التقييم'); }
    finally { setRunning(false); setProgress(''); }
  };
  const report = evaluation?.reports[selected];
  return <div className="space-y-5" dir="rtl">
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="font-heading font-semibold">التقييم المتداخل واختيار المؤشرات</h3>
      <p className="text-sm text-muted-foreground">فحص البيانات ← ضبط زمني داخلي ← اختبار خارجي مستقل ← مقارنة خط أساس ← قياس عدم اليقين.</p>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="مصدر التقييم" disabled={running} value={source} onChange={e => { setSource(e.target.value); setEvaluation(null); }} className="rounded-lg border border-input bg-background p-2 text-sm">
          <option value="real">البيانات المحملة، كلا النوعين والهدفين</option><option value="stress">متانة اصطناعية، 6 سيناريوهات × 3 بذور</option>
        </select>
        <button disabled={running || (source === 'real' && !incidents.length)} onClick={run} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{running ? 'جاري التقييم' : 'تشغيل التقييم والضبط'}</button>
      </div>
      {running && <p role="status" className="text-sm text-muted-foreground">{progress || 'تجهيز البيانات...'}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!incidents.length && source === 'real' && <p className="text-sm text-muted-foreground">ارفع بيانات الحوادث أولاً.</p>}
    </section>
    {evaluation && <>
      <EvaluationProtocol evaluation={evaluation} />
      <select aria-label="نتائج السيناريو والهدف" className="w-full rounded-lg border border-input bg-background p-3" value={selected} onChange={e => setSelected(Number(e.target.value))}>{evaluation.reports.map((r, i) => <option key={i} value={i}>{r.name} / {r.type === 'all' ? 'كلا النوعين' : r.type} / {r.target === 'incidents' ? 'الحوادث' : 'المعتقلون'}</option>)}</select>
      {report && <><EvaluationMetricsTable report={report} /><EvaluationSelection report={report} /></>}
      <EvaluationTactical results={evaluation.tactical} />
    </>}
    <EvaluationSources />
  </div>;
}