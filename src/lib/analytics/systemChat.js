import { prepareAnalysisFacts } from "./numericalAnalysis.js";

const normalize = value => String(value || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064b-\u065f]/g, "");
const label = value => String(value ?? "غير متاح").replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>#!()|]/g, character => `\\${character}`);

export function answerSystemQuestion(question, context = {}) {
  const query = normalize(question);
  const evidence = context.evidence || {};
  const facts = context.forecastFacts;
  const response = (text, topic, source = "دليل النظام") => ({ text, topic, source, method: "verified-facts" });
  if (!query.trim()) return response("اكتب سؤالاً عن البيانات أو التوقعات أو مكونات النظام.", "clarification");
  if (/ignore.*instruction|تجاهل.*تعليم|اختلق|اخترع|fabricate|pretend|system prompt/.test(query)) return response("لن أختلق نتائج أو أغير حقائق البيانات. يمكنني تفسير القيم المحملة أو شرح طريقة عمل النظام.", "refusal");
  if (/مؤكد|بالتاكيد.*حادث|guarantee|definitely|سبب سياسي|political cause/.test(query)) return response("النظام يقدم توقعات إحصائية، ولا يثبت وقوع حادث مستقبلي أو سبباً سياسياً أو أمنياً. يمكنني شرح التقدير المعروض وأدلة الرصد المستخدمة فيه.", "refusal");
  if (/لماذا|سبب|why|cause/.test(query) && !/ثابت|flat|توقع|forecast|نموذج|model|خطا|error/.test(query)) return response("يمكنني وصف الأنماط والعلاقات العددية في السجلات، لكن الأرقام وحدها لا تثبت سبباً سياسياً أو أمنياً أو علاقة سببية. لا أستطيع تقديم سبب غير موثق.", "refusal");

  if (/rmse|wape|mase|دقة|خطا|accuracy|validation|تحقق/.test(query)) {
    let text = "**قراءة التقييم:** RMSE يقيس حجم الخطأ بوحدة الهدف، ولا يمثل نسبة ثقة أو نطاق توقع. WAPE يقيس الخطأ المطلق نسبة إلى الحجم الفعلي، وMASE يقارن الخطأ بمرجع مبسط. يجب تقييم النتائج على بيانات زمنية لم تستخدم في التدريب، ومقارنتها بخط أساس.";
    if (Number.isFinite(facts?.validationRmse)) text += `\n\nRMSE المعروض للوحة ${label(facts.target)} هو **${facts.validationRmse}**.`;
    if (Number.isFinite(facts?.validatedHorizonMonths)) text += ` أفق التحقق المعلن **${facts.validatedHorizonMonths} أشهر**، وليس كامل الإسقاط البعيد.`;
    return response(text, "validation", facts ? "دليل النظام ومقاييس اللوحة" : "دليل النظام");
  }
  if (/غابة|randomforest|lightgbm|xgboost|python/.test(query)) return response("نماذج الغابات العشوائية وLightGBM وXGBoost مدرجة في البيئة المرجعية التي تتطلب Python، وليست نماذج نشطة في التطبيق المحلي. لا يلزم Python لتشغيل التطبيق أو تنظيف الملف بأداة PowerShell.", "reference-models");
  if (/نموذج|نماذج|model|algorithm|خوارزم/.test(query) && !/ثابت|flat|توقع/.test(query)) return response("**النموذج الافتراضي:** AutoTunedModel يقارن إعدادات المتوسط الحديث والموسمية والاتجاه والانحدار المتأخر باستخدام تحقق زمني. يختار مرشحاً أو توليفة، أو يحتفظ بخط الأساس إذا لم يتحسن معيار الاختيار بما يكفي. العدد الفعلي للمرشحين متاح في قسم النماذج وآلية العمل؛ لا يعني وجود نماذج متعددة أنها تعمل جميعاً لكل نتيجة.", "models");
  if (/مسار|pipeline|تدريب|training|مراحل|تجميع/.test(query)) return response("**مسار النظام:** قراءة CSV والتحقق منه، ثم تجميع شهري حسب المحافظة والهدف، وتقسيم زمني للتدريب والمعايرة والتحقق، ثم تدريب واختيار النموذج وتقييمه والتوقع. المسار الموسمي يعرض الأشهر، والتكتيكي يشتق معدلات يومية من النتائج الشهرية. المساعد النصي يشرح النتائج ولا يغيّرها.", "pipeline");
  if (/خريطة|map|حدود|border|leaflet|شارع|street/.test(query)) return response("الخريطة تستخدم Leaflet وبلاطات متجهية من ملفات محلية لأسماء الأماكن والطرق. حدود الدولة خطوط مرجعية من OpenStreetMap، وليست مستطيلات تقسيم. إحصاء الحدود يعد الحادث قرب أقرب خط ضمن 25 كم فقط، ويترك الوقائع الداخلية خارج هذا النطاق دون إسناد. القرب من خط لا يثبت عبوره.", "map");
  if (/تنظيف|clean|excel|csv|احداثيات|coordinate|power.?shell|encoding/.test(query)) return response("الاستيراد يقبل CSV محلياً بأسماء الأعمدة المطلوبة. أداة PowerShell تحول Excel إلى UTF-8 وتحافظ على الملف الأصلي. لإحداثيات Web Mercator يحدد خيار التحويل صراحة: northing إلى latitude وeasting إلى longitude. لا تختار التحويل لمجرد أن الأرقام كبيرة؛ يجب أن يطابق نظام الإحداثيات المصدر.", "import");
  if (/تقرير|شرح|report|chat|مساعد|gdelt|اخبار|مصادر|hallucin/.test(query)) return response("التقرير يقرأ المؤشرات المحسوبة من بيانات الجلسة والتوقعات، ويفصل النشاط المرصود عن المستقبل المتوقع. لا يسترجع أخباراً أو GDELT. النص التوليدي الذي يفشل الفحوص لا يعرض؛ يستبدل بتحليل مقيد بالحقائق. هذا المساعد يجيب من الحسابات ودليل النظام فقط، ولا يقدم معلومات خارج ذلك أو يضمن دقة التوقعات.", "reports");
  if (/offline|اتصال|انترنت|مكونات|components|electron/.test(query)) return response("الواجهة والحسابات والخريطة تعمل محلياً. Electron يضم التطبيق وخادماً على الجهاز لخدمة الملفات والمساعد، وليس خدمة سحابية. Qwen وllama.cpp مكونان للتفسير المحلي، بينما محرك التوقع الإحصائي مستقل عنهما. تنزيل المثبت يحتاج اتصالاً قبل نقله، أما تشغيله على الجهاز الآخر فلا يحتاج الإنترنت.", "offline");

  if (/توقع|forecast|prediction|ثابت|flat|قادم|مستقبل/.test(query)) {
    if (!facts) return response("لم تُعرض لوحة توقع في هذه الجلسة بعد. لا أستطيع إعطاء قيم مستقبلية غير محسوبة؛ يمكنني شرح النماذج أو تحليل السجلات المحملة.", "clarification");
    const analysis = prepareAnalysisFacts(facts).computedAnalysis;
    const projected = analysis.projected;
    let text = `**نطاق الإجابة:** ${label(facts.target || "عدد الحوادث")}، ${label(facts.incidentType || "النطاق المعروض")}.\n\n`;
    if (projected.count) {
      text += `الفترة ${label(projected.start)} إلى ${label(projected.end)}؛ متوسط القيم ${analysis.forecastUnit === "month" ? "الشهرية" : "اليومية"} المتوقعة **${projected.mean}**، والأدنى **${projected.minimum}** والأعلى **${projected.maximum}**.`;
      if (projected.minimum === projected.maximum) text += " الخط ثابت في هذه السلسلة، لا يعني ثبات الوقائع الفعلية.";
      if (analysis.matchesRecentMean) text += ` مستوى الخط مقارب للمتوسط الحديث **${analysis.recentComparisonMean}**.`;
      if (analysis.forecastVsHistoricalPercent != null) text += ` التغير في المستوى مقارنة بالمتوسط التاريخي الشهري **${analysis.forecastVsHistoricalPercent}%**؛ ليس اتجاهاً مستقبلياً بحد ذاته.`;
    } else if (Number.isFinite(facts.expectedIncidentTotal)) text += `الإجمالي المتوقع في النافذة المعروضة **${facts.expectedIncidentTotal} حادثاً**، وليس حدثاً مؤكداً.`;
    else return response("القيم المستقبلية المطلوبة غير موجودة في سياق اللوحة الحالية. حدد اللوحة أو الهدف الذي تسأل عنه.", "clarification");
    return response(text, "forecast", "القيم المحسوبة للوحة التوقع");
  }
  if (/نمط|انماط|pattern|موسم|season|اتجاه|trend|تقطع|متقطع|تباين|variab/.test(query)) {
    if (!evidence.datedRecords) return response("لا توجد سجلات محملة لتحليل أنماطها. لن أستنتج نمطاً زمنياً دون سلسلة مرصودة.", "clarification");
    const analyzed = prepareAnalysisFacts({ observedEvidence: evidence }).computedAnalysis.historical;
    let text = `**أنماط عدد الحوادث في السلسلة الشهرية:** ${analyzed.start} إلى ${analyzed.end}.\n\nالمتوسط **${analyzed.mean}**؛ الأدنى **${analyzed.minimum}** والأعلى **${analyzed.maximum}**، مع **${analyzed.zeroPeriods} فترات صفرية**.`;
    if (analyzed.repeatedLag) text += ` يظهر تكرار وصفي بفاصل **${analyzed.repeatedLag} أشهر**؛ ليس إثباتاً لسبب أو موسم.`;
    if (analyzed.annualPattern === "insufficient-history") text += " طول التاريخ لا يكفي لتثبيت موسمية سنوية عبر دورتين كاملتين.";
    if (evidence.assumedZeroMonths) text += " فترات عدم وجود سجلات عوملت كصفر؛ تفسيرها كنشاط صفري يعتمد على اكتمال الرصد.";
    return response(text, "patterns", "السلسلة الشهرية المحسوبة من السجلات");
  }
  if (/معتقل|detain|عدد|كم|count|total|سجل|incident|حادث|حوادث|تهريب|تسلل|بيانات|data|تاريخ|فترة|date|متى|اخر|when|last|governorate|محافظة/.test(query)) {
    if (!evidence.datedRecords) return response("لا توجد بيانات حوادث محملة في الجلسة؛ لا أستطيع إعطاء أعداد أو تواريخ لم يتم توفيرها.", "clarification");
    const selectedGovernorate = (evidence.governorates || []).find(group => {
      const arabicName = normalize(group.label.split(" - ")[0].replace(/^محافظة\s+/, ""));
      return arabicName && query.includes(arabicName);
    });
    const requestedDate = query.match(/\d{4}-\d{2}(?:-\d{2})?/)?.[0];
    if (selectedGovernorate && !requestedDate && /عدد|كم|count|total|how many|معتقل|detain|حوادث|incident/.test(query)) return response(`**${label(selectedGovernorate.label)}:** ${selectedGovernorate.incidents} واقعة و ${selectedGovernorate.detained} معتقلاً ضمن ${evidence.observationStart} إلى ${evidence.observationEnd}. هذه أعداد العينة المحملة فقط.`, "governorate-data", "إجماليات المحافظة في بيانات الجلسة");
    if (requestedDate) {
      if (!selectedGovernorate && /(?:^|\s)(?:في|in)\s+(?!\d)[\p{L}]/u.test(query)) return response("لا أستطيع مطابقة المكان المطلوب مع بيانات الجلسة؛ لن أستخدم إجمالي التاريخ كأنه عدد ذلك المكان.", "clarification");
      if (requestedDate < evidence.observationStart.slice(0, requestedDate.length) || requestedDate > evidence.observationEnd.slice(0, requestedDate.length)) return response("التاريخ المطلوب خارج فترة السجلات المحملة؛ لا أستطيع إعطاء عدد مرصود له أو استبداله بتوقع.", "clarification");
      if (!Array.isArray(context.records)) return response("لا توجد تفاصيل السجلات المطلوبة في سياق هذا السؤال؛ لا أستطيع استخدام إجمالي الفترة كعدد يوم محدد.", "clarification");
      const selected = context.records.filter(record => {
        const date = new Date(record.incident_date);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, requestedDate.length) === requestedDate
          && (!selectedGovernorate || record.governorate === selectedGovernorate.label);
      });
      return response(`السجلات المطابقة للفترة **${requestedDate}** في العينة: **${selected.length} واقعة** و **${selected.reduce((total, record) => total + (Number(record.detained_count) || 0), 0)} معتقلاً**. عدم وجود سجلات لا يثبت اكتمال الرصد.`, "dated-data", "السجلات المطابقة للتاريخ في الجلسة");
    }
    if (/(?:في|in)\s+\S+/.test(query) && /عدد|كم|count|how many|معتقل|detain|حوادث|incident/.test(query) && !/في النظام|في البيانات|in the (?:system|data)/.test(query)) return response("لا أستطيع تحديد عدد خاص بالمكان المطلوب دون مطابقته لمحافظة ضمن السجلات المحملة. لن أستخدم إجمالي العينة كأنه عدد ذلك المكان. اذكر اسم المحافظة كما يظهر في البيانات.", "clarification");
    const incidentType = query.includes("تهريب") ? "تهريب" : query.includes("تسلل") ? "تسلل" : null;
    const group = incidentType ? evidence.incidentTypes.find(item => item.label === incidentType || item.label === `ال${incidentType}`) : null;
    let text = `**السجلات المحملة:** ${evidence.datedRecords} واقعة و ${evidence.totalDetained} معتقلاً، من ${evidence.observationStart} إلى ${evidence.observationEnd}. متوسط المعتقلين لكل واقعة **${evidence.detaineesPerIncident}**.`;
    if (incidentType) text += group ? `\n\nفئة ${incidentType}: **${group.incidents} وقائع** و **${group.detained} معتقلاً** ضمن النطاق المحمل.` : `\n\nلا توجد سجلات لفئة ${incidentType} ضمن هذه العينة؛ لا يعني ذلك عدم وجودها خارجها.`;
    if (/محافظ|governorate/.test(query)) text += `\n\n${evidence.governorates.slice(0, 5).map(item => `${label(item.label)}: ${item.incidents} واقعة (${item.incidentSharePercent}%)`).join("\n\n")}`;
    return response(text, "observed-data", "إجماليات بيانات الجلسة الحالية");
  }
  return response("لا أملك دليلاً كافياً للإجابة عن هذا السؤال ضمن بيانات الجلسة أو دليل النظام. حدد المؤشر أو النموذج أو الجزء المقصود، بدلاً من استنتاج إجابة غير موثقة.", "clarification");
}