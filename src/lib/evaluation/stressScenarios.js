import { generateSyntheticIncidents } from '@/lib/evaluation/syntheticData';
export const SCENARIOS = [
  {
    name: 'التخطيط لدورية في نمط موسمي مستقر',
    useCase: 'تخطيط الموارد الشهرية عند ثبات النشاط وتكرار الموسم.',
    expectedOutcome: 'ذروة صيفية متكررة، معدلات مستقرة بين المحافظات، ونسبة نوع ثابتة.',
    params: { trendPerMonth: 0 },
  },
  {
    name: 'الاستعداد لزيادة موسمية تدريجية',
    useCase: 'توقع الضغط عند نمو النشاط مع بقاء التوزيع الموسمي والمكاني.',
    expectedOutcome: 'اتجاه صاعد يقارب 2% شهرياً مع استمرار الذروة الصيفية.',
    params: { trendPerMonth: 0.02 },
  },
  {
    name: 'إعادة توزيع الموارد بعد تحول مفاجئ',
    useCase: 'اكتشاف تغير مفاجئ في الحجم والمحافظة ونوع الحادث.',
    expectedOutcome: 'تراجع حاد في الحجم، انتقال أعلى النشاط إلى مسندم وموقع ج، وغلبة التسلل بعد الشهر 36.',
    params: { trendPerMonth: 0, shockMultiplier: 0.2, spatialShift: true, typeShift: true, locationShift: true, shiftMonth: 36 },
  },
];
export function stressDatasets() {
  return SCENARIOS.flatMap(s => [42, 77, 99].map(seed => ({
    name: `${s.name} (${seed})`,
    useCase: s.useCase,
    expectedOutcome: s.expectedOutcome,
    records: generateSyntheticIncidents({ ...s.params, seed, startDate: '2021-01-01', endDate: '2024-12-31' }),
    observedEnd: (2024 - 1960) * 12 + 12,
  })));
}