import React from 'react';
import { number } from '@/components/analytics/EvaluationMetricsTable';
export default function EvaluationTactical({ results }) {
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold">اختبار يومي مطابق لنافذة التوقع</h3>
    <p className="text-sm text-muted-foreground">وزن المشاهدات الحديثة مضبوط مستقلاً للحوادث والمعتقلين على نوافذ سابقة فقط؛ المرجع عدد آخر 30 يوماً.</p>
    {results.map(d => <div key={d.name} className="overflow-x-auto"><h4 className="text-sm font-medium">{d.name}</h4><table className="w-full text-sm text-right"><thead><tr>{['الهدف','أيام','نوافذ','MAE','WAPE %','تفوق %'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{d.results.map(r => <tr className="border-t border-border" key={`${r.target}-${r.horizon}`}><td className="p-2">{r.target === 'incidents' ? 'الحوادث' : 'المعتقلون'}</td><td className="p-2">{r.horizon}</td><td className="p-2">{r.n}</td><td className="p-2">{number(r.mae)}</td><td className="p-2">{number(r.wape)}</td><td className="p-2">{number(r.skill)}</td></tr>)}</tbody></table></div>)}
    {!results.length && <p className="text-muted-foreground text-sm">لا توجد نوافذ كاملة كافية للاختبار اليومي.</p>}
  </section>;
}