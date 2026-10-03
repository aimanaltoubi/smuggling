import React from 'react';
export const number = v => v == null || !Number.isFinite(v) ? 'غير متاح' : v.toFixed(2);
export default function EvaluationMetricsTable({ report }) {
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold">اختبار خارجي: {report.name} / {report.type} / {report.target === 'incidents' ? 'الحوادث' : 'المعتقلون'}</h3>
    {report.error ? <p className="text-destructive">{report.error}</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead><tr className="border-b border-border">{['أفق بالأشهر', 'نقاط اختبار', 'MAE', 'RMSE', 'WAPE %', 'MASE', 'انحياز', 'تفوق %', 'تغطية نطاق 80%'].map(h => <th className="p-2 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>
        {report.byHorizon.map(r => <tr key={r.horizon} className="border-b border-border"><td className="p-2">{r.horizon}</td><td className="p-2">{r.n}</td>{['mae','rmse','wape','mase','bias','skill','coverage'].map(k => <td className="p-2" key={k}>{number(r[k])}</td>)}</tr>)}
      </tbody></table></div>
      <p className="text-xs text-muted-foreground">WAPE خطأ نسبي وليس دقة احتمالية؛ الأقل أفضل. MASE محسوب من التدريب فقط، والأقل من 1 أفضل من الخطأ الموسمي المرجعي. الانحياز الموجب توقع زائد، والتفوق السالب يعني أن خط الأساس أفضل.</p>
      <p className="text-sm">المكان: تطابق الأعلى {number(report.spatial.top1)}%، تداخل أعلى ثلاث {number(report.spatial.top3)}% عبر {report.spatial.n} نوافذ غير فارغة؛ التعادل مقبول.</p>
      <h4 className="font-medium">دليل التحسن مقابل التوقع الموسمي الساذج</h4>
      {report.byHorizon.map(r => <p className="text-sm text-muted-foreground" key={r.horizon}>{r.horizon} أشهر: {r.evidence.origins} نقاط رصد، نطاق فرق الخطأ التقريبي 95% [{number(r.evidence.lower)}, {number(r.evidence.upper)}]، {r.evidence.supported ? 'يدعم تحسناً' : 'لا يثبت تحسناً'}.</p>)}
      <p className="text-xs text-muted-foreground">إعادة معاينة مزدوجة حسب نقطة الرصد، لا حسب الحوادث. النطاق تقريبي، وليس اختبار دلالة مؤكداً مع النوافذ المتداخلة.</p>
    </>}
  </section>;
}