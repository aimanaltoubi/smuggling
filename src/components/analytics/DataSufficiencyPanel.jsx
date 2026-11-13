import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const BANNER = {
  pass: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: ShieldCheck, iconColor: 'text-green-600' },
  warn: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: ShieldAlert, iconColor: 'text-amber-600' },
  fail: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: ShieldX, iconColor: 'text-red-600' },
};
const CELL = {
  pass: { label: 'ناجح', cls: 'text-green-700', Icon: CheckCircle2 },
  warn: { label: 'تحذير', cls: 'text-amber-700', Icon: AlertTriangle },
  fail: { label: 'غير كافٍ', cls: 'text-red-700', Icon: XCircle },
};

function TestTable({ tests }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm text-right">
    <thead><tr className="border-b border-border">{['الاختبار', 'القيمة المقاسة', 'الحد المطلوب', 'النتيجة'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
    <tbody>{tests.map(t => {
      const c = CELL[t.status], Icon = c.Icon;
      return <tr key={t.id} className="border-b border-border align-top">
        <td className="p-2"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground mt-0.5">{t.note}</div></td>
        <td className="p-2 whitespace-nowrap">{t.measured}</td>
        <td className="p-2 whitespace-nowrap">{t.threshold}</td>
        <td className="p-2 whitespace-nowrap"><span className={`flex items-center gap-1 font-medium ${c.cls}`}><Icon className="w-4 h-4" />{c.label}</span></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export default function DataSufficiencyPanel({ sufficiency }) {
  if (!sufficiency) return null;
  const banner = BANNER[sufficiency.status], Icon = banner.icon;
  return <section className="space-y-4" dir="rtl">
    <div className={`rounded-xl border-2 ${banner.border} ${banner.bg} p-5`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-8 h-8 ${banner.iconColor} flex-shrink-0 mt-0.5`} />
        <div>
          <h3 className="font-bold text-lg">كفاية البيانات للتنبؤ: {sufficiency.verdict}</h3>
          <p className={`text-sm ${banner.text} mt-1`}>{sufficiency.verdictText}</p>
          <p className="text-xs text-muted-foreground mt-1">تُجرى الاختبارات على بنية البيانات ثم على الدقة المقاسة من الاختبار الرجعي؛ فشل أي اختبار بنيوي يجعل مقاييس الدقة نفسها غير موثوقة.</p>
        </div>
      </div>
    </div>
    {sufficiency.types.map(t => {
      const c = CELL[t.status];
      return <div key={t.type} className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-semibold">اختبارات كفاية بيانات {t.type} ({t.records} سجل)</h4>
          <span className={`font-bold ${c.cls}`}>{t.verdict}</span>
        </div>
        <TestTable tests={t.tests} />
      </div>;
    })}
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h4 className="font-semibold">اختبار مشترك بين الفئتين</h4>
      <TestTable tests={[sufficiency.balance]} />
      {sufficiency.recommendations.length > 0 && <>
        <h4 className="font-semibold">إجراءات مطلوبة لرفع كفاية البيانات</h4>
        <ul className="list-disc pr-5 text-sm space-y-1">{sufficiency.recommendations.map(r => <li key={r}>{r}</li>)}</ul>
      </>}
    </div>
  </section>;
}
