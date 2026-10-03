import { AverageModel, LocfModel, SeasonalClimatologyModel, TrendSeasonalModel, AdaptiveTrendModel } from '@/lib/pipeline/Baselines';
import LagRidgeModel from '@/lib/pipeline/LagRidgeModel';
export const CANDIDATES = [
  { id: 'recent-3', cls: AverageModel, hp: { windowMonths: 3 }, predictors: 'متوسط آخر 3 أشهر' },
  { id: 'recent-6', cls: AverageModel, hp: { windowMonths: 6 }, predictors: 'متوسط آخر 6 أشهر' },
  { id: 'recent-12', cls: AverageModel, hp: { windowMonths: 12 }, predictors: 'متوسط آخر 12 شهراً' },
  { id: 'last', cls: LocfModel, hp: {}, predictors: 'آخر مشاهدة' },
  { id: 'seasonal-24', cls: SeasonalClimatologyModel, hp: { windowMonths: 24 }, predictors: 'الموسمية، نافذة 24 شهراً' },
  { id: 'seasonal-36', cls: SeasonalClimatologyModel, hp: { windowMonths: 36 }, predictors: 'الموسمية، نافذة 36 شهراً' },
  { id: 'trend-seasonal', cls: TrendSeasonalModel, hp: { windowMonths: 36 }, predictors: 'الموسمية والاتجاه السنوي' },
  ...[0.2, 0.5].flatMap(alpha => [0.8, 0.95].map(phi => ({ id: `holt-${alpha}-${phi}`, cls: AdaptiveTrendModel, hp: { alpha, beta: 0.1, phi, windowMonths: 36 }, predictors: 'الموسمية والاتجاه المخمد' }))),
  ...['recent', 'seasonal', 'trend'].flatMap(featureSet => [1, 20].map(ridge => ({ id: `ridge-${featureSet}-${ridge}`, cls: LagRidgeModel, hp: { featureSet, ridge }, predictors: featureSet === 'recent' ? 'تأخر شهر ومتوسط 3 أشهر' : featureSet === 'seasonal' ? 'تأخر شهر وسنة ومتوسط وموسمية' : 'تأخر ومتوسط وموسمية وتغير حديث' }))),
];
export function makeCandidate(c, target, start, horizon, loa) { return new c.cls({ targets: [target], partition: { test_start: start, output_length: horizon }, loa, ...c.hp }); }
export function frameMap(frame) { return new Map(frame.time.map((m, i) => [`${m}::${frame.unit[i]}`, frame.y_pred[i][0]])); }
export function blendMaps(maps, weights) {
  const out = new Map();
  maps.forEach((map, i) => { for (const [key, v] of map) out.set(key, (out.get(key) || 0) + weights[i] * v); });
  return out;
}