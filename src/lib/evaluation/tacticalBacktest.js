import TacticalForecast from '@/lib/pipeline/TacticalForecast';
import { DAY, monthDays } from '@/lib/pipeline/TacticalCalibration';
import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
import { mean, metrics } from '@/lib/evaluation/metrics';
import { pause } from '@/lib/evaluation/monthlyBacktest';

const dayKey = value => new Date(value).toISOString().slice(0, 10);

function leaders(counts) {
  if (!counts.size) return [];
  const max = Math.max(...counts.values());
  return [...counts].filter(([, count]) => count === max).map(([key]) => key);
}

function percent(rows, key) {
  return rows.length ? mean(rows.map(row => Number(row[key]))) * 100 : null;
}

export default async function tacticalBacktest(records, origins, onProgress) {
  const totals = [];
  const dailyIncidents = [];
  const dailyDetained = [];
  const outcomes = [];

  for (const origin of origins.slice(-4)) {
    const cutoff = new Date(Date.UTC(1960 + Math.floor((origin - 1) / 12), (origin - 1) % 12 + 1, 0));
    const train = records.filter(record => toMonthId(record.incident_date) <= origin);

    for (const horizon of [7, 14, 30]) {
      onProgress(`اختبار مخرجات التوقع ${horizon} يوماً`);
      await pause();
      const prediction = TacticalForecast(train, { horizonDays: horizon, observationEnd: cutoff });
      if (!prediction) continue;

      const windowEnd = cutoff.getTime() + horizon * DAY;
      const actual = records.filter(record => {
        const time = Date.parse(record.incident_date);
        return time > cutoff.getTime() && time <= windowEnd;
      });
      const recent = train.filter(record => Date.parse(record.incident_date) > cutoff.getTime() - 30 * DAY);
      const actualDetained = actual.reduce((sum, record) => sum + (record.detained_count || 0), 0);
      const recentDetained = recent.reduce((sum, record) => sum + (record.detained_count || 0), 0);
      const predictedIncidents = prediction.when.totalExpectedIncidents;
      const predictedDetained = prediction.howMany.expectedTotalDetained;

      totals.push(
        { origin, horizon, target: 'incidents', actual: actual.length, predicted: predictedIncidents, baseline: recent.length / 30 * horizon, scale: 0 },
        { origin, horizon, target: 'detained_count', actual: actualDetained, predicted: predictedDetained, baseline: recentDetained / 30 * horizon, scale: 0 },
      );

      const actualByDay = new Map();
      const actualByType = new Map();
      const actualByGovernorate = new Map();
      actual.forEach(record => {
        const date = dayKey(record.incident_date);
        actualByDay.set(date, (actualByDay.get(date) || 0) + 1);
        actualByType.set(record.incident_type, (actualByType.get(record.incident_type) || 0) + 1);
        actualByGovernorate.set(record.governorate, (actualByGovernorate.get(record.governorate) || 0) + 1);
      });

      const predictedPeakDay = dayKey(prediction.when.peakDay.date);
      const actualPeakDays = leaders(actualByDay);
      const actualTypes = leaders(actualByType);
      const actualGovernorates = leaders(actualByGovernorate);
      const predictedGovernorate = prediction.where.governorate;
      const predictedTopThree = prediction.where.ranking.slice(0, 3).map(item => item.governorate);
      const actualLocations = new Map();
      actual.filter(record => record.governorate === predictedGovernorate).forEach(record => {
        actualLocations.set(record.location_name, (actualLocations.get(record.location_name) || 0) + 1);
      });
      const actualPeakWithinOneDay = actualPeakDays.some(date =>
        Math.abs(Date.parse(date) - Date.parse(predictedPeakDay)) <= DAY
      );

      outcomes.push({
        origin,
        horizon,
        actualEvents: actual.length,
        dailyIncidentMaeRows: prediction.when.dailyBreakdown.map(day => ({
          actual: actualByDay.get(dayKey(day.date)) || 0,
          predicted: day.expected,
          baseline: recent.length / 30,
          scale: 0,
        })),
        dailyDetainedMaeRows: prediction.when.dailyBreakdown.map(day => {
          const date = dayKey(day.date);
          const actualCount = actual.filter(record => dayKey(record.incident_date) === date)
            .reduce((sum, record) => sum + (record.detained_count || 0), 0);
          return {
            actual: actualCount,
            predicted: day.detained,
            baseline: recentDetained / 30,
            scale: 0,
          };
        }),
        typeHit: actualTypes.length ? actualTypes.includes(prediction.howMany.predictedType) : null,
        governorateHit: actualGovernorates.length ? actualGovernorates.includes(predictedGovernorate) : null,
        topThreeHit: actualGovernorates.length ? actualGovernorates.some(name => predictedTopThree.includes(name)) : null,
        locationHit: actualLocations.size ? leaders(actualLocations).includes(prediction.where.location) : null,
        peakExact: actualPeakDays.length ? actualPeakDays.includes(predictedPeakDay) : null,
        peakWithinOneDay: actualPeakDays.length ? actualPeakWithinOneDay : null,
        detainedPerIncidentError: actual.length
          ? Math.abs(prediction.howMany.expectedDetainedPerIncident - actualDetained / actual.length)
          : null,
      });

      dailyIncidents.push(...outcomes.at(-1).dailyIncidentMaeRows);
      dailyDetained.push(...outcomes.at(-1).dailyDetainedMaeRows);
    }
  }

  const results = ['incidents', 'detained_count'].flatMap(target => [7, 14, 30].map(horizon => ({
    target,
    horizon,
    ...metrics(totals.filter(row => row.target === target && row.horizon === horizon)),
  })));

  const quality = [7, 14, 30].map(horizon => {
    const windows = outcomes.filter(row => row.horizon === horizon);
    const classified = windows.filter(row => row.actualEvents > 0);
    return {
      horizon,
      windows: windows.length,
      dailyIncidents: metrics(windows.flatMap(row => row.dailyIncidentMaeRows)),
      dailyDetained: metrics(windows.flatMap(row => row.dailyDetainedMaeRows)),
      typeAccuracy: percent(classified.filter(row => row.typeHit != null), 'typeHit'),
      topGovernorateAccuracy: percent(classified.filter(row => row.governorateHit != null), 'governorateHit'),
      topThreeGovernorateRecall: percent(classified.filter(row => row.topThreeHit != null), 'topThreeHit'),
      locationAccuracy: percent(classified.filter(row => row.locationHit != null), 'locationHit'),
      peakDayExact: percent(classified.filter(row => row.peakExact != null), 'peakExact'),
      peakDayWithinOneDay: percent(classified.filter(row => row.peakWithinOneDay != null), 'peakWithinOneDay'),
      detainedPerIncidentMae: mean(classified.map(row => row.detainedPerIncidentError).filter(Number.isFinite)),
      classifiedWindows: classified.length,
    };
  });

  return { results, quality };
}