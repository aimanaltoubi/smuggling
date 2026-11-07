import { prepareAnalysisFacts } from "./numericalAnalysis.js";

const normalize = value => String(value || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064b-\u065f]/g, "");
const label = value => String(value ?? "غير متاح").replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>#!()|]/g, character => `\\${character}`);
const displayNumber = value => Number.isFinite(value) ? String(+value.toFixed(2)) : "غير متاح";

export function answerSystemQuestion(question, context = {}) {
  const query = normalize(question);
  const evidence = context.evidence || {};
  const facts = context.forecastFacts;
  const response = (text, topic, source = "دليل النظام") => ({ text, topic, source, method: "verified-facts" });
  if (!query.trim()) return response("اكتب سؤالاً عن البيانات أو التوقعات أو مكونات النظام.", "clarification");
  if (/ماذا\s+تستطيع|بماذا\s+تستطيع|كيف\s+تساعد|ما\s+الذي\s+تستطيع|what\s+can\s+you\s+help|what\s+can\s+you\s+do|capabilit/.test(query)) return response("أستطيع مساعدتك في قراءة الأعداد المعروضة، وتحليل الاتجاه والتذبذب والأشهر الصفرية والقمم، ومقارنة التوقعات بالمستوى التاريخي، وشرح مؤشرات المحافظات والحدود، وبيان طريقة عمل النماذج وخطوات التقييم. كما أستطيع إعداد قراءة تحليلية من ستة أقسام. اسألني مثلاً: «حلل نتائج التهريب»، «لماذا خط التوقع ثابت؟»، أو «كم عدد المعتقلين في البريمي؟». أجيب من بيانات الجلسة والتوقعات المتاحة، ولا أستنتج أسباباً أو وقائع غير موجودة فيها.", "capabilities");
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

  if (/حلل|تحليل|دلالات|ماذا\s+تعني|ما\s+معنى|استنتج|analy[sz]e|interpret|implication/.test(query)) {
    if (!evidence.datedRecords) return response("لا توجد سجلات محملة لتحليلها. حمّل البيانات أولاً، ثم أستطيع تحليل اتجاهها وتذبذبها وتركيبها.", "clarification");
    const target = /معتقل|detain/i.test(query) ? "عدد المعتقلين" : facts?.target || "عدد الحوادث";
    const analysisFacts = prepareAnalysisFacts({ ...(facts || {}), target, observedEvidence: evidence });
    const analysis = analysisFacts.computedAnalysis;
    const selectedType = evidence.scope && evidence.scope !== "all loaded records" ? evidence.scope : query.includes("تهريب") ? "التهريب" : query.includes("تسلل") ? "التسلل" : null;
    const typeEvidence = selectedType ? evidence.incidentTypes.find(item => normalize(item.label).includes(normalize(selectedType.replace(/^ال/, "")))) : null;
    const scopeLead = selectedType && typeEvidence ? `ضمن سجلات ${label(selectedType)}` : "ضمن السجلات المعروضة";
    let text = `${scopeLead} من ${label(evidence.observationStart)} إلى ${label(evidence.observationEnd)}، بلغ العدد ${typeEvidence ? `${typeEvidence.incidents} واقعة و${typeEvidence.detained} معتقلاً` : `${evidence.datedRecords} واقعة و${evidence.totalDetained} معتقلاً`}. متوسط المعتقلين لكل واقعة ${evidence.detaineesPerIncident}.`;
    const historical = analysis.historical;
    if (historical.count) {
      text += `\n\nعلى مستوى الأشهر التقويمية، متوسط ${label(target)} هو ${historical.mean} شهرياً، والمدى من ${historical.minimum} إلى ${historical.maximum}، والانحراف المعياري ${historical.standardDeviation}.`;
      if (historical.zeroPeriods) text += ` تشمل السلسلة ${historical.zeroPeriods} أشهر صفرية من أصل ${historical.count} شهراً؛ تعامل معها النموذج كصفر، مع بقاء اكتمال الرصد افتراضاً غير متحقق.`;
      if (historical.recentChange != null) text += ` متوسط آخر 3 أشهر ${historical.recentMean} مقابل ${historical.previousMean} في الأشهر الثلاثة السابقة؛ الفرق ${historical.recentChange}${historical.recentChangePercent == null ? "" : ` (${historical.recentChangePercent}%)`}.`;
      if (historical.descriptiveMonthlySlope != null) text += ` الميل الخطي الوصفي ${historical.descriptiveMonthlySlope} لكل شهر؛ وهو وصف زمني لا يثبت سبباً.`;
      if (historical.repeatedLag) text += ` يظهر تكرار وصفي بفاصل ${historical.repeatedLag} أشهر، وليس إثباتاً لموسمية سنوية.`;
      if (historical.peakPeriods.length) text += ` أعلى الأشهر المسجلة ${historical.peakPeriods.join("، ")} بقيمة ${historical.maximum}.`;
    }
    const governorates = evidence.governorates.slice(0, 3);
    if (governorates.length) text += `\n\nالتوزيع الجغرافي في العينة: ${governorates.map(place => `${label(place.label)} ${place.incidents} واقعة (${place.incidentSharePercent}%)`).join("، ")}. التركز المرصود لا يثبت ممراً أو سبباً.`;
    const projected = analysis.projected;
    if (facts?.projectedMonthlyValues?.length && projected.count) {
      text += `\n\nمتوسط التوقع الشهري ${projected.mean} من ${label(projected.start)} إلى ${label(projected.end)}، مقارنة بمتوسط تاريخي ${historical.mean}.`;
      if (projected.minimum === projected.maximum) {
        text += " الخط ثابت في فترة التوقع، فلا يعيد التذبذب التاريخي.";
        if (analysis.matchesRecentMean) text += ` مستواه يطابق متوسط آخر 3 أشهر (${analysis.recentComparisonMean})${(facts.selectedCandidates || []).some(candidate => candidate.id === "recent-3") ? "، ويتوافق ذلك مع المرشح المحدد، وهو متوسط آخر 3 أشهر" : ""}. لا يثبت ذلك أن الأشهر المقبلة ستكون متساوية.`;
      } else text += ` مدى التوقع ${projected.minimum} إلى ${projected.maximum}، والتغير في مستوى المتوسط مقارنة بالتاريخ ${analysis.forecastVsHistoricalPercent}%.`;
      if (analysis.yearlyTotals.length) text += ` الإجمالي المتوقع سنوياً: ${analysis.yearlyTotals.map(year => `${year.year} ${year.total}`).join("، ")}.`;
      if (Number.isFinite(facts.validationRmse)) text += ` RMSE التحقق ${facts.validationRmse} على أفق ${facts.validatedHorizonMonths} أشهر؛ لذلك لا يساوي خطأ التحقق صفراً ولا يثبت دقة كامل مدة الإسقاط.`;
    } else if (facts?.expectedIncidentTotal != null) {
      text += `\n\nإجمالي التوقع للفترة التكتيكية ${facts.expectedIncidentTotal} حادثاً خلال ${facts.window?.days ?? "الفترة المعروضة"} يوم. يعكس هذا التوقع المخرج المعروض، ولا يحدد أحداثاً مؤكدة.`;
    }
    return response(text, "analytical-reading", "الإحصاءات الوصفية المحسوبة وسجلات وتوقعات اللوحة");
  }

  if (/توقع|forecast|prediction|ثابت|flat|قادم|مستقبل/.test(query)) {
    if (!facts) return response("لم تُعرض لوحة توقع في هذه الجلسة بعد. لا أستطيع إعطاء قيم مستقبلية غير محسوبة؛ يمكنني شرح النماذج أو تحليل السجلات المحملة.", "clarification");
    const annualQuestion = /(?:ال|لل)سنة القادم(?:ة)?|(?:ال|لل)سنة المقبل(?:ة)?|(?:ال|لل)عام القادم|(?:ال|لل)عام المقبل|الاثني عشر شهرا|الاثني عشر شهراً|12 شهرا|12 شهراً|next year|year ahead|next 12 months/.test(query);
    if (annualQuestion && facts.forecast?.startsWith("tactical")) return response("اللوحة الحالية تعرض توقعاً تكتيكياً لنافذة قصيرة، وليست توقعاً سنوياً. افتح التوقع الموسمي لعرض التوقع الشهري للسنة القادمة؛ لن أمدد توقع الفترة القصيرة إلى سنة.", "forecast-horizon", "أفق اللوحة التكتيكية الحالية");
    const analysis = prepareAnalysisFacts(facts).computedAnalysis;
    const projected = analysis.projected;
    const tacticalForecast = facts.forecast?.startsWith("tactical");
    let text = `**نطاق الإجابة:** ${label(facts.target || "عدد الحوادث")}، ${label(facts.incidentType || "النطاق المعروض")}.\n\n`;
    if (projected.count) {
      if (annualQuestion && analysis.forecastUnit === "month" && analysis.yearlyTotals.length) {
        const firstYear = analysis.yearlyTotals[0];
        text += `الإجمالي المتوقع لـ ${label(facts.target || "الهدف المعروض")} في السنة الأولى من التوقع (${firstYear.year}) هو **${displayNumber(firstYear.total)}**. هذا مجموع شهري متوقع للسنة، وليس حوادث مؤكدة.`;
        if (analysis.yearlyTotals.length > 1) text += `\n\nالإجماليات السنوية عبر كامل الأفق المعروض: ${analysis.yearlyTotals.map(year => `${year.year}: ${displayNumber(year.total)}`).join("، ")}.`;
      } else if (tacticalForecast) {
        const days = facts.window?.days || facts.dailyIncidentForecast?.length || projected.count;
        const total = Number.isFinite(facts.expectedIncidentTotal) ? facts.expectedIncidentTotal : projected.total;
        text += `النافذة التكتيكية من ${label(projected.start)} إلى ${label(projected.end)} (${days} يوماً): إجمالي الحوادث المتوقع **${displayNumber(total)}**، بمتوسط يومي **${displayNumber(projected.mean)}**. وهذا توقع للنافذة القصيرة المعروضة، وليس توقعاً سنوياً أو حدثاً مؤكداً.`;
      } else text += `الفترة ${label(projected.start)} إلى ${label(projected.end)}؛ متوسط القيم ${analysis.forecastUnit === "month" ? "الشهرية" : "اليومية"} المتوقعة **${displayNumber(projected.mean)}**، والأدنى **${displayNumber(projected.minimum)}** والأعلى **${displayNumber(projected.maximum)}**.`;
      if (!tacticalForecast && projected.minimum === projected.maximum) text += " الخط ثابت في هذه السلسلة، لا يعني ثبات الوقائع الفعلية.";
      if (!tacticalForecast && analysis.matchesRecentMean) text += ` مستوى الخط مقارب للمتوسط الحديث **${analysis.recentComparisonMean}**.`;
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