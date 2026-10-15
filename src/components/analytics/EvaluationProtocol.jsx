import React from 'react';
export default function EvaluationProtocol({ evaluation }) {
  const a = evaluation.audit;
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-heading font-semibold">{evaluation.verdict}</h3>
    <p className="text-sm text-muted-foreground">{evaluation.methodology}</p>
    <p className="text-sm">تفوق مدعوم في {evaluation.supported} من {evaluation.evaluated} مجموعات هدف وأفق. هذا ليس احتمال صحة التوقع.</p>
    {evaluation.source === 'stress' && <div className="space-y-2 text-sm">
      <h4 className="font-medium">حالات الاستخدام والنتيجة المزروعة للاختبار</h4>
      {evaluation.useCases.map(item => <p key={item.useCase}><strong>{item.useCase}</strong> النتيجة المعروفة: {item.expectedOutcome}</p>)}
      <p className="text-xs text-muted-foreground">كل تقرير يقيس الحوادث والمعتقلين لكل نوع، ثم يقارن النوافذ المستقبلية المحجوبة بما توقعه النموذج قبل كشف نتائجها.</p>
    </div>}
    {evaluation.source === 'real' && <div className="text-sm space-y-1">
      <p>فحص البيانات: {a.usable} من {a.original} سجل صالح، {a.months} شهراً بين {a.start || '—'} و{a.end || '—'}.</p>
      <p>مستبعد: تواريخ {a.invalidDates}، معرفات مكررة {a.duplicateIds}، أعداد غير صالحة {a.invalidCounts}، محافظة مفقودة {a.missingGovernorates}.</p>
      <p>أشهر دون سجلات: {a.zeroMonths}. تُعامل كصفر بشرط اكتمال الإبلاغ؛ لا يمكن تمييزها عن انقطاع الرصد من البيانات الحالية.</p>
    </div>}
    <p className="text-sm text-muted-foreground">يُستبعد أحدث شهر من التقييم الحقيقي لعدم تأكيد اكتماله. الاختبار يقيس 1 و3 و6 أشهر و7 و14 و30 يوماً؛ توقعات السنوات الأربع ليست متحققة. التداخل بين نوافذ الاختبار وحجم العينة الصغير يحدان من قوة الدليل.</p>
    <p className="text-sm text-muted-foreground">اختيار من 17 إعداداً، بما فيها مجموعات مؤشرات مقارنة: المشاهدات المتأخرة، المتوسط الحديث، الموسم، وتغير الاتجاه. لا تُستخدم معلومات الحادث المستقبلية أو بيانات خارجية غير متاحة.</p>
  </section>;
}