import { generateSyntheticIncidents } from '@/lib/evaluation/syntheticData';
export const SCENARIOS = [
  { name: 'صاعد', params: { trendPerMonth: 0.02 } },
  { name: 'ضوضاء مرتفعة', params: { trendPerMonth: 0.03, noise: 1.4 } },
  { name: 'اتجاه هابط', params: { trendPerMonth: -0.018 } },
  { name: 'موسمية مستقرة', params: { trendPerMonth: 0 } },
  { name: 'هبوط مفاجئ', params: { trendPerMonth: 0, shockMultiplier: 0.2, shiftMonth: 36 } },
  { name: 'قلة أحداث وتحول مكاني ونوعي', params: { trendPerMonth: 0, rateScale: 0.25, spatialShift: true, typeShift: true, shiftMonth: 36 } },
];
export function stressDatasets() { return SCENARIOS.flatMap(s => [42, 77, 99].map(seed => ({ name: `${s.name} (${seed})`, records: generateSyntheticIncidents({ ...s.params, seed, startDate: '2021-01-01', endDate: '2024-12-31' }), observedEnd: (2024 - 1960) * 12 + 12 }))); }