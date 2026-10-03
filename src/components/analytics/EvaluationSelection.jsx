import React from 'react';
import { number } from '@/components/analytics/EvaluationMetricsTable';
export default function EvaluationSelection({ report }) {
  if (!report.selection) return null;
  const s = report.selection;
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold">المكونات والمؤشرات المختارة قبل الاختبار النهائي</h3>
    <p className="text-sm">{s.method}، {s.folds} نوافذ تحقق داخلي، خط الأساس المحمي: {s.baseline}.</p>
    {s.members.map((m, i) => <div key={m.id} className="rounded-lg border border-border p-3"><p className="font-medium">{m.id}، وزن {number(100 * s.weights[i])}%</p><p className="text-sm text-muted-foreground">{m.predictors}</p><p className="text-xs text-muted-foreground" dir="ltr">{JSON.stringify(m.parameters)}</p></div>)}
    <p className="text-xs text-muted-foreground">الدالة الثابتة للاختيار: نصف خطأ الإجمالي ونصف خطأ المحافظات، مقيسان بحجم التدريب، وبأوزان متساوية لأفق 1 و3 و6 أشهر. تُقارن مكونات منفردة ومتوسط متساوٍ وتجميع عكسي الخطأ. يُحتفظ بخط الأساس إن كان التحسن الداخلي أقل من 2%.</p>
    <div className="overflow-x-auto max-h-64"><table className="w-full text-sm text-right"><thead><tr><th className="p-2">الإعداد</th><th className="p-2">المؤشرات</th><th className="p-2">خطأ التحقق</th></tr></thead><tbody>{s.leaderboard.map(r => <tr key={r.id} className="border-t border-border"><td className="p-2" dir="ltr">{r.id}</td><td className="p-2">{r.predictors}</td><td className="p-2">{number(r.score)}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">النطاقات تجريبية من أخطاء التحقق الداخلي، لا ضمان تغطية. يُعرض قياس تغطيتها الفعلية في الاختبار الخارجي، ولا تُعدّل بناءً عليه.</p>
  </section>;
}