import React from "react";
import { Cpu, Database, GitBranch, Layers3, ShieldCheck } from "lucide-react";
import { MODEL_REGISTRY } from "@/lib/pipeline/ModelCatalog";
import { CANDIDATES } from "@/lib/pipeline/tuningCandidates";

const MODEL_DESCRIPTIONS = {
  AutoTunedModel: "المحدد الافتراضي: يقارن إعدادات مرشحة وتوليفات باستخدام تحقق زمني، ويختار نتيجة أفضل من خط الأساس عند توفر الدليل.",
  ZeroModel: "خط أساس يتوقع صفراً، للمقارنة وليس توصية تشغيلية.",
  LocfModel: "يستخدم آخر قيمة مرصودة كمرجع للتوقع.",
  AverageModel: "يستخدم متوسط نافذة من الأشهر السابقة.",
  ConflictologyModel: "خط أساس إحصائي لتوزيع القيم الشهرية المرصودة وتباينها.",
  MixtureBaseline: "يجمع بين مكونات خطوط الأساس بدلاً من الاعتماد على مرجع واحد.",
  SeasonalClimatologyModel: "يستخدم النمط التاريخي للشهر نفسه لتمثيل الموسمية.",
  TrendSeasonalModel: "يمزج الموسمية مع اتجاه السلسلة والتغير الحديث.",
  AdaptiveTrendModel: "خط أساس لاتجاه متكيف مع التغير الزمني.",
};

const STAGES = [
  { name: "إدخال البيانات والتحقق", detail: "يقرأ التطبيق ملف CSV المحلي ويتحقق من التواريخ والإحداثيات والحقول المطلوبة. تنظيف Excel وتحويل إحداثيات N/E يتمان مسبقاً بواسطة أداة محلية منفصلة." },
  { name: "التجميع والإعداد", detail: "يحوّل محمل البيانات السجلات إلى سلسلة شهرية حسب المحافظة أو المستوى المحدد، وبهدف منفصل لعدد الحوادث أو المعتقلين." },
  { name: "التقسيم الزمني", detail: "تُشتق فترات التدريب والمعايرة والتحقق بترتيب الأشهر، تقريباً 60% و20% و20% من المدى الزمني. لا يجري خلط المستقبل بالماضي عشوائياً." },
  { name: "التدريب واختيار النموذج", detail: "يشغّل مدير النماذج التدريب. يستخدم المحدد الافتراضي نوافذ تحقق متحركة داخل التاريخ المتاح لمقارنة المرشحين وخطوط الأساس." },
  { name: "التقييم", detail: "يقارن المخرجات ببيانات زمنية محجوبة. تعرض صفحة التقييم أخطاء التوقع ومهارته مقابل خط أساس، للبيانات المحلية أو الحالات الاصطناعية." },
  { name: "التوقع والعرض", detail: "ينتج المسار توقعات شهرية، ثم يهيئها جسر النتائج للرسوم والجداول أو يحوّلها المسار التكتيكي إلى معدلات يومية ومؤشرات مكانية." },
  { name: "التفسير المحلي", detail: "يقرأ مولد التقارير ملخصات السجلات والتوقعات وحدود التحقق. لا يغيّر النموذج الإحصائي، ويستخدم تحليلاً مقيداً بالحقائق عند رفض النص التوليدي." },
];

const PIPELINE_COMPONENTS = [
  { name: "ConfigurationManager", role: "يجمع اختيار النموذج والهدف ومستوى التجميع والفترات الزمنية وإعدادات التوقع." },
  { name: "ViewsDataLoader", role: "يبني لوحة البيانات الشهرية من سجلات الحوادث بالمستوى الجغرافي المحدد." },
  { name: "ModelCatalog", role: "يحدد النماذج المتاحة وينشئ النموذج المختار، ويرفض النماذج غير المتاحة في البيئة المحلية." },
  { name: "ForecastingModelManager", role: "ينسق مراحل التدريب والتقييم والتوقع والتقرير الاختياري، وفق الإعدادات الممررة." },
  { name: "TrainingStage / EvaluationStage / ForecastingStage", role: "تنفذ تدريب النموذج، فحص أدائه زمنياً، ثم إنتاج القيم المستقبلية. ReportingStage مرحلة تقرير برمجي اختيارية منفصلة عن المساعد اللغوي." },
  { name: "PipelineBridge / TacticalForecast", role: "يهيئ نتائج المحرك للواجهة: سلاسل شهرية للعرض الموسمي، أو معدلات يومية وتوزيع جغرافي للمسار التكتيكي." },
];

export default function SystemGuideSection() {
  const models = Object.entries(MODEL_REGISTRY);
  const available = models.filter(([, model]) => model.available);
  const referenceOnly = models.filter(([, model]) => !model.available);
  return (
    <div className="space-y-8" dir="rtl">
      <header className="border-b border-border pb-4">
        <div className="flex items-center gap-2"><GitBranch className="h-5 w-5" /><h2 className="text-xl font-semibold">النماذج وآلية عمل النظام</h2></div>
        <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">نظام تحليل وتوقع محلي يعمل على سجلات التهريب والتسلل. المحرك الإحصائي ينتج التوقعات؛ الخريطة تعرضها؛ والمساعد النصي يشرحها ولا يثبت صحتها أو ينشئ أحداثاً مؤكدة.</p>
      </header>

      <section aria-labelledby="pipeline-guide-title">
        <h3 id="pipeline-guide-title" className="mb-4 flex items-center gap-2 font-semibold"><Layers3 size={18} />مسار المعالجة</h3>
        <ol className="divide-y divide-border border-y border-border">
          {STAGES.map((stage, index) => <li key={stage.name} className="grid gap-2 py-4 sm:grid-cols-[2rem_13rem_1fr]"><span className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><h4 className="text-sm font-semibold">{stage.name}</h4><p className="text-sm leading-7 text-muted-foreground">{stage.detail}</p></li>)}
        </ol>
      </section>

      <section aria-labelledby="active-models-title">
        <h3 id="active-models-title" className="mb-3 flex items-center gap-2 font-semibold"><Cpu size={18} />النماذج المتاحة في التطبيق ({available.length})</h3>
        <p className="mb-3 text-sm leading-7 text-muted-foreground">المساران الموسمي والتكتيكي يستخدمان المحدد الافتراضي. بقية النماذج المتاحة هي بدائل برمجية وخطوط مقارنة؛ وجودها في الفهرس لا يعني تشغيلها كلها معاً لكل نتيجة.</p>
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full table-fixed text-right text-sm"><thead><tr className="border-b border-border bg-muted/40"><th className="w-2/5 p-3 sm:w-1/4">النموذج</th><th className="p-3">الدور</th></tr></thead><tbody>
            {available.map(([name]) => <tr key={name} className="border-b border-border last:border-0"><td className="p-3 align-top"><code dir="ltr" className="break-all text-xs">{name}</code></td><td className="p-3 leading-7">{MODEL_DESCRIPTIONS[name] || "نموذج متاح في الفهرس البرمجي."}</td></tr>)}
          </tbody></table>
        </div>
      </section>

      <section aria-labelledby="selection-guide-title">
        <h3 id="selection-guide-title" className="mb-3 font-semibold">كيف يختار المحدد الافتراضي؟</h3>
        <p className="text-sm leading-7">يقارن <code dir="ltr">AutoTunedModel</code> عدد {CANDIDATES.length} من الإعدادات: المتوسطات الحديثة، آخر قيمة، الموسمية، الاتجاه الموسمي، إعدادات الاتجاه المخمد، وانحدار القيم المتأخرة. يقيم أخطاء آفاق 1 و3 و6 أشهر داخل نوافذ زمنية متحركة.</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">يمكن اختيار مرشح منفرد أو مزج أفضل المرشحين بأوزان متساوية أو مرتبطة بالخطأ عند توفر نوافذ تحقق كافية. لا يستبدل خط الأساس إلا إذا تحسن معيار الاختيار بأكثر من 2%. عند نقص البيانات قد يحتفظ بمتوسط حديث، وتصبح بعض مقاييس التحقق أو النطاقات غير متاحة.</p>
        <details className="mt-3 border-y border-border py-3"><summary className="cursor-pointer text-sm font-medium">النماذج المرجعية غير المشغلة في التطبيق ({referenceOnly.length})</summary><p className="mt-2 text-sm leading-7 text-muted-foreground">هذه الأسماء موجودة في الفهرس للمقارنة مع البيئة المرجعية، وتتطلب مكتبات Python. ليست نماذج نشطة في مثبت Windows، ولا يلزم تثبيت Python لتشغيل التطبيق.</p><ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">{referenceOnly.map(([name]) => <li key={name}><code dir="ltr">{name}</code></li>)}</ul></details>
      </section>

      <section aria-labelledby="outputs-guide-title">
        <h3 id="outputs-guide-title" className="mb-3 font-semibold">المخرجات ومعناها</h3>
        <dl className="divide-y divide-border border-y border-border">
          <div className="grid gap-2 py-4 sm:grid-cols-[13rem_1fr]"><dt className="text-sm font-semibold">التوقع الموسمي</dt><dd className="text-sm leading-7">تجميع شهري للحوادث والمعتقلين وإسقاط حتى 48 شهراً، لكل نوع حادث أو النطاق المختار. آفاق التقييم 1 و3 و6 أشهر؛ الإسقاط لأربع سنوات ليس متحققاً بالكامل.</dd></div>
          <div className="grid gap-2 py-4 sm:grid-cols-[13rem_1fr]"><dt className="text-sm font-semibold">التنبؤ التكتيكي</dt><dd className="text-sm leading-7">يحوّل توقعات المحافظات الشهرية إلى معدلات يومية ويمزج النشاط الحديث بأوزان مضبوطة لكل هدف. يعرض نافذة 14 يوماً، والخريطة تقارن 14 و30 يوماً. الموقع هو آخر موقع مرصود للمحافظة الأعلى، والنوع مرجح من التوزيع الحديث؛ ليس وعداً بحدث محدد.</dd></div>
          <div className="grid gap-2 py-4 sm:grid-cols-[13rem_1fr]"><dt className="text-sm font-semibold">الخريطة والحدود</dt><dd className="text-sm leading-7">الخريطة المحلية تعرض السجلات ومؤشرات التوقع. ألوان النشاط تعتمد على التكرار التاريخي النسبي، وليس احتمالات معايرة. خطوط الحدود مرجعية؛ إحصاء القرب يستخدم أقرب خط ضمن 25 كم ويترك الحوادث الداخلية خارج النطاق دون إسناد.</dd></div>
        </dl>
      </section>

      <section aria-labelledby="components-guide-title">
        <h3 id="components-guide-title" className="mb-3 flex items-center gap-2 font-semibold"><Database size={18} />مكونات النظام والعمل دون اتصال</h3>
        <ul className="space-y-2 text-sm leading-7 list-disc pr-5">
          <li><strong>واجهة React:</strong> إدخال CSV والتحليل والرسوم والتقييم، مع المعالجة محلياً في ذاكرة الجلسة.</li>
          <li><strong>محرك JavaScript:</strong> إعداد البيانات والتقسيم الزمني والتدريب والتقييم والتوقع؛ لا يعتمد على خادم سحابي.</li>
          <li><strong>Leaflet:</strong> خريطة متجهية من ملفات جغرافية وأسماء أماكن مضمنة، دون خدمة بلاطات خارجية أو WebGL.</li>
          <li><strong>Electron:</strong> حزمة Windows وخادم على هذا الجهاز لملفات التطبيق وخدمة التفسير؛ ليس رفعاً للبيانات إلى الإنترنت.</li>
          <li><strong>Qwen وllama.cpp:</strong> تفسير عربي على المعالج المحلي؛ عند فشل فحوص الجودة يظهر قالب حقائق معلّم بوضوح بدلاً من النص المرفوض.</li>
          <li><strong>أداة PowerShell:</strong> تنظيف Excel أو CSV إلى UTF-8 وتحويل إحداثيات Web Mercator عند اختيارها، دون تغيير الملف الأصلي.</li>
        </ul>
      </section>

      <section aria-labelledby="software-guide-title">
        <h3 id="software-guide-title" className="mb-3 font-semibold">مكونات محرك التوقع</h3>
        <dl className="divide-y divide-border border-y border-border">
          {PIPELINE_COMPONENTS.map(component => <div key={component.name} className="grid gap-2 py-3 sm:grid-cols-[18rem_1fr]"><dt className="min-w-0 text-xs"><code dir="ltr" className="break-words">{component.name}</code></dt><dd className="text-sm leading-7 text-muted-foreground">{component.role}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="limits-guide-title" className="border-t border-border pt-4">
        <h3 id="limits-guide-title" className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck size={18} />التقييم وحدود الاستخدام</h3>
        <p className="text-sm leading-7">RMSE يقيس حجم الخطأ، وWAPE يقيس الخطأ المطلق نسبة إلى الحجم الفعلي، وMASE يقارن الخطأ بمرجع مبسط، والمهارة تقارن النموذج بخط أساس. انخفاض الخطأ وتحسن المهارة يدعمان الأداء على فترة الاختبار فقط، لا يضمنان المستقبل.</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">نطاقات 80% تجريبية من أخطاء التحقق الداخلي وليست تغطية مضمونة. اختبارات البيانات الاصطناعية تفحص السلوك تحت أنماط معروفة، ولا تثبت دقة الوقائع المحلية. التقارير النصية ليست مصدراً مستقلاً أو تغذية GDELT، وقد تحتاج مراجعة بشرية حتى بعد فحوص الجودة. راجع صفحة تقييم النموذج وبيانات المصدر قبل الاستخدام التشغيلي.</p>
      </section>
    </div>
  );
}