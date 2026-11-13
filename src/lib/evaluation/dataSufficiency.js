import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';

// Data-sufficiency test suite: structural checks on the records plus the
// measured backtest accuracies, each with explicit thresholds, deciding
// whether the data is complete enough for dependable forecasts.
const RANK = { fail: 0, warn: 1, pass: 2 };
const fmt = v => v == null || !Number.isFinite(v) ? 'غير متاح' : String(Math.round(v * 100) / 100);
const test = (id, name, measured, threshold, status, note) => ({ id, name, measured, threshold, status, note });

function structural(rows) {
  const mids = rows.map(r => toMonthId(r.incident_date));
  const first = Math.min(...mids), last = Math.max(...mids), span = rows.length ? last - first + 1 : 0;
  const withData = new Set(mids);
  let longestGap = 0, run = 0;
  for (let m = first; m <= last; m++) { run = withData.has(m) ? 0 : run + 1; longestGap = Math.max(longestGap, run); }
  const zero = Math.max(0, span - withData.size);
  const govs = new Set(rows.map(r => r.governorate || 'unknown')).size;
  return { span, zero, longestGap, govs, density: span && govs ? rows.length / (span * govs) : 0 };
}

function typeTests(subset, report) {
  const s = structural(subset);
  const tests = [
    test('volume', 'حجم السجلات', `${subset.length} سجل`, '≥ 1000 (تحذير من 300)',
      subset.length >= 1000 ? 'pass' : subset.length >= 300 ? 'warn' : 'fail',
      'النماذج تحتاج حجماً كافياً لتعلم أنماط قابلة للتعميم بدلاً من الضوضاء'),
    test('span', 'طول التاريخ الشهري', `${s.span} شهراً`, '≥ 36 شهراً (تحذير من 24)',
      s.span >= 36 ? 'pass' : s.span >= 24 ? 'warn' : 'fail',
      'تعلم الموسمية يتطلب دورتين سنويتين كاملتين على الأقل'),
    test('gaps', 'اكتمال الأشهر', `${s.zero} شهراً خالياً، أطول انقطاع ${s.longestGap} شهراً`, 'صفر أشهر خالية (تحذير حتى 10% وانقطاع ≤ شهرين)',
      s.zero === 0 ? 'pass' : (s.span && s.zero / s.span <= 0.1 && s.longestGap <= 2) ? 'warn' : 'fail',
      'الأشهر الخالية تُعامل كأصفار؛ إن كانت انقطاع إدخال فهي تشوه المعدل والموسمية واختيار النموذج'),
    test('density', 'كثافة الخلايا (شهر × محافظة)', `${fmt(s.density)} حادث للخلية عبر ${s.govs} محافظة`, '≥ 3 (تحذير من 1)',
      s.density >= 3 ? 'pass' : s.density >= 1 ? 'warn' : 'fail',
      'الخلايا شبه الصفرية تجعل المفاضلة بين النماذج قريبة من العشوائية'),
  ];
  if (!report || report.error || !report.origins?.length) {
    tests.push(test('folds', 'نقاط التحقق الرجعي', report?.error || 'التقييم غير متاح', '≥ 4 نقاط رصد (تحذير من 2)', 'fail',
      'بدون نقاط رصد كافية لا يمكن قياس الدقة أو اختيار النموذج بثقة'));
    return { tests, summary: null };
  }
  const folds = report.origins.length, m = report.summary || {};
  const horizons = (report.byHorizon || []).filter(h => h.n > 0);
  const supported = horizons.filter(h => h.evidence?.supported).length;
  tests.push(
    test('folds', 'نقاط التحقق الرجعي', `${folds} نقاط رصد`, '≥ 4 (تحذير من 2)',
      folds >= 4 ? 'pass' : folds >= 2 ? 'warn' : 'fail',
      'كلما قلت نقاط الرصد ضعفت موثوقية مقاييس الدقة نفسها'),
    test('mase', 'الدقة النسبية MASE', fmt(m.mase), '< 0.9 (تحذير حتى 1.1)',
      m.mase == null ? 'fail' : m.mase < 0.9 ? 'pass' : m.mase <= 1.1 ? 'warn' : 'fail',
      'أكبر من 1 يعني أن التوقع الموسمي الساذج أدق من النموذج'),
    test('wape', 'الخطأ النسبي WAPE', m.wape == null ? 'غير متاح' : `${fmt(m.wape)}%`, '≤ 30% (تحذير حتى 60%)',
      m.wape == null ? 'fail' : m.wape <= 30 ? 'pass' : m.wape <= 60 ? 'warn' : 'fail',
      'خطأ نسبي مرتفع يجعل الأرقام المتوقعة غير صالحة للتخطيط'),
    test('evidence', 'دليل التفوق على خط الأساس', `${supported} من ${horizons.length} آفاق مدعومة`, 'كل الآفاق (تحذير عند بعضها)',
      horizons.length && supported === horizons.length ? 'pass' : supported > 0 ? 'warn' : 'fail',
      'بدون تفوق مثبت على خط أساس بسيط لا مبرر للاعتماد على النموذج'),
    test('coverage', 'تغطية نطاق عدم اليقين 80%', m.coverage == null ? 'غير متاح' : `${fmt(m.coverage)}%`, '65% إلى 95% (تحذير خارجها)',
      m.coverage == null ? 'fail' : m.coverage >= 65 && m.coverage <= 95 ? 'pass' : 'warn',
      'تغطية بعيدة عن 80% تعني أن نطاقات الثقة المعروضة غير معايرة'),
  );
  return { tests, summary: m };
}

const VERDICTS = {
  fail: { label: 'غير كافية', text: 'البيانات غير كافية لإنتاج تنبؤات دقيقة؛ النماذج تحتاج كمية أكبر من السجلات المكتملة والمتصلة زمنياً لتعلم الأنماط الحقيقية.' },
  warn: { label: 'كافية جزئياً', text: 'البيانات تسمح بمؤشرات استرشادية فقط؛ استكمال الإدخال وتوسيع التاريخ مطلوبان قبل اعتماد التنبؤات.' },
  pass: { label: 'كافية', text: 'البيانات تجتاز اختبارات الكفاية الحالية؛ تبقى المراجعة الدورية ضرورية مع كل تحديث.' },
};
const worst = statuses => statuses.reduce((w, s) => RANK[s] < RANK[w] ? s : w, 'pass');

export default function assessDataSufficiency({ rows = [], reports = [], observedEnd = Infinity }) {
  const usable = rows.filter(r => Number.isFinite(toMonthId(r.incident_date)) && toMonthId(r.incident_date) <= observedEnd);
  const types = ['تهريب', 'تسلل'].map(type => {
    const subset = usable.filter(r => r.incident_type === type);
    const report = reports.find(r => r.type === type && r.target === 'incidents');
    const { tests } = typeTests(subset, report);
    const status = worst(tests.map(t => t.status));
    return { type, records: subset.length, tests, status, verdict: VERDICTS[status].label };
  });
  const counts = types.map(t => t.records), total = counts.reduce((s, v) => s + v, 0);
  const minorityShare = total ? Math.min(...counts) / total : 0;
  const balance = test('balance', 'توازن الفئات (تهريب مقابل تسلل)', `${fmt(minorityShare * 100)}% للفئة الأقل`, '≥ 25% (تحذير من 10%)',
    minorityShare >= 0.25 ? 'pass' : minorityShare >= 0.1 ? 'warn' : 'fail',
    'الاختلال الشديد يجعل تنبؤ النوع مجرد ترديد للفئة الغالبة، ويترك الفئة الأقل بلا إشارة كافية');
  const status = worst([...types.map(t => t.status), balance.status]);
  const recommendations = status === 'pass' ? [] : [
    'استكمال الإدخال الرجعي للأشهر الخالية؛ اكتمال التاريخ يحسن الدقة أكثر من أي تطوير في النماذج',
    'توثيق فترات انقطاع الرصد صراحةً حتى لا تُعامل كأشهر هادئة حقيقية',
    'الاستمرار في إدخال منتظم وكامل لمدة لا تقل عن 24 شهراً متصلاً قبل اعتماد توقعات الموسمية',
    'التعامل مع تنبؤات الفئة قليلة السجلات كمؤشر أولي فقط حتى يتراكم حجم كافٍ',
  ];
  return { types, balance, status, verdict: VERDICTS[status].label, verdictText: VERDICTS[status].text, recommendations, totalRecords: usable.length };
}
