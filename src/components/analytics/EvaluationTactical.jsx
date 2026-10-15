import React from 'react';
import { number } from '@/components/analytics/EvaluationMetricsTable';
export default function EvaluationTactical({ results }) {
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold">اختبار يومي مطابق لنافذة التوقع</h3>
    <p className="text-sm text-muted-foreground">مقارنة توقعات كل نافذة بأحداثها المحجوبة، مع مرجع معدل آخر 30 يوماً. دقة النوع والمكان والذروة محسوبة فقط للنوافذ التي وقع فيها حادث واحد على الأقل.</p>
    {results.map(d => <div key={d.name} className="overflow-x-auto"><h4 className="text-sm font-medium">{d.name}</h4><table className="w-full text-sm text-right"><thead><tr>{['الهدف','أيام','نوافذ','MAE','WAPE %','تفوق %'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{d.results.map(r => <tr className="border-t border-border" key={`${r.target}-${r.horizon}`}><td className="p-2">{r.target === 'incidents' ? 'الحوادث' : 'المعتقلون'}</td><td className="p-2">{r.horizon}</td><td className="p-2">{r.n}</td><td className="p-2">{number(r.mae)}</td><td className="p-2">{number(r.wape)}</td><td className="p-2">{number(r.skill)}</td></tr>)}</tbody></table></div>)}
    {results.map(d => <div key={`${d.name}-outputs`} className="overflow-x-auto">
      <h4 className="text-sm font-medium">مطابقة بقية المخرجات: {d.name}</h4>
      <table className="w-full text-sm text-right"><thead><tr>{['الأفق','نوافذ','WAPE يومي للحوادث','WAPE يومي للمعتقلين','صحة النوع %','صحة أعلى محافظة %','استدعاء أعلى 3 محافظات %','صحة الموقع %','ذروة ضمن يوم %','MAE معتقل/حادث'].map(h => <th className="p-2 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead>
        <tbody>{(d.quality || []).map(row => <tr className="border-t border-border" key={row.horizon}>
          <td className="p-2">{row.horizon}</td><td className="p-2">{row.classifiedWindows}/{row.windows}</td>
          <td className="p-2">{number(row.dailyIncidents.wape)}</td><td className="p-2">{number(row.dailyDetained.wape)}</td>
          <td className="p-2">{number(row.typeAccuracy)}</td><td className="p-2">{number(row.topGovernorateAccuracy)}</td>
          <td className="p-2">{number(row.topThreeGovernorateRecall)}</td><td className="p-2">{number(row.locationAccuracy)}</td>
          <td className="p-2">{number(row.peakDayWithinOneDay)}</td><td className="p-2">{number(row.detainedPerIncidentMae)}</td>
        </tr>)}</tbody>
      </table>
      <p className="text-xs text-muted-foreground">WAPE اليومي يقيس توزيع العدد على الأيام؛ صحة المكان والنوع تقبل التعادل في الواقع. درجة المخاطر نسبة ترتيب وليست احتمالاً معايراً.</p>
    </div>)}
    {!results.length && <p className="text-muted-foreground text-sm">لا توجد نوافذ كاملة كافية للاختبار اليومي.</p>}
  </section>;
}