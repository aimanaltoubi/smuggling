// Dynamic short-term (next N days) tactical prediction.
// Detects where the data actually stops (last incident date) and projects
// forward from there using a daily-rate model: day-of-week effect + monthly
// seasonal effect + recent-trend factor, combined with a spatial risk model.
// Portable: mirrors python_reference/prediction.py.

const DAY_MS = 24 * 3600 * 1000;

function addDays(d, n) {
  return new Date(d.getTime() + n * DAY_MS);
}

function fmtDate(d) {
  return `${d.getDate()} ${["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][d.getMonth()]} ${d.getFullYear()}`;
}

// Predict incidents in the next `horizonDays` after the last recorded incident.
export function predictNextEvent(incidents, options = {}) {
  const horizonDays = options.horizonDays || 14;

  const valid = incidents
    .filter((i) => i.incident_date && !isNaN(new Date(i.incident_date).getTime()))
    .map((i) => ({ ...i, _d: new Date(i.incident_date) }));
  if (valid.length < 2) return null;

  valid.sort((a, b) => a._d - b._d);
  const dataStartDate = valid[0]._d;
  const dataEndDate = valid[valid.length - 1]._d;

  const forecastStart = addDays(dataEndDate, 1);
  const forecastEnd = addDays(dataEndDate, horizonDays);

  // --- 1. Daily rate model ---
  const totalDays = Math.max(1, Math.round((dataEndDate - dataStartDate) / DAY_MS) + 1);
  const overallDailyRate = valid.length / totalDays;

  // Day-of-week multipliers (0=Sun .. 6=Sat)
  const dowCounts = Array(7).fill(0);
  for (const r of valid) dowCounts[r._d.getDay()]++;
  const dowAvg = valid.length / 7;
  const dowMultiplier = dowCounts.map((c) => (dowAvg > 0 ? c / dowAvg : 1));

  // Monthly seasonal multipliers (1..12)
  const monthCounts = Array(13).fill(0);
  for (const r of valid) monthCounts[r._d.getMonth() + 1]++;
  const monthAvg = valid.length / 12;
  const monthMultiplier = monthCounts.map((c) => (monthAvg > 0 ? c / monthAvg : 1));

  // Recent trend: last 30 days rate vs overall
  const recent30Cutoff = new Date(dataEndDate.getTime() - 30 * DAY_MS);
  const recent30 = valid.filter((r) => r._d >= recent30Cutoff);
  const recentDailyRate = recent30.length / 30;
  const trendFactorRaw = overallDailyRate > 0 ? recentDailyRate / overallDailyRate : 1;
  const trendFactor = Math.min(2, Math.max(0.5, trendFactorRaw)); // clamp

  // --- 2. Expected incidents per day in the forecast window ---
  const dailyForecast = [];
  let totalExpected = 0;
  for (let d = new Date(forecastStart); d <= forecastEnd; d = addDays(d, 1)) {
    const dow = d.getDay();
    const mon = d.getMonth() + 1;
    const expected = overallDailyRate * dowMultiplier[dow] * monthMultiplier[mon] * trendFactor;
    dailyForecast.push({ date: new Date(d), expected: +expected.toFixed(3) });
    totalExpected += expected;
  }
  totalExpected = +totalExpected.toFixed(2);

  // Peak day
  const peak = dailyForecast.reduce((a, b) => (b.expected > a.expected ? b : a), dailyForecast[0]);

  // --- 3. Spatial risk (where) anchored to the forecast window ---
  const risk = spatialRisk(valid, forecastStart, forecastEnd);

  // --- 4. Type prediction from the forecast window's months ---
  const typeRisk = typeRiskModel(valid, forecastStart, forecastEnd);

  // --- 5. Expected detained ---
  const predictedType = typeRisk.topType;
  const typeRecords = valid.filter((i) => i.incident_type === predictedType);
  const avgDetainedPerIncident = typeRecords.length
    ? typeRecords.reduce((a, b) => a + (b.detained_count || 0), 0) / typeRecords.length
    : valid.reduce((a, b) => a + (b.detained_count || 0), 0) / valid.length;
  const expectedTotalDetained = +(totalExpected * avgDetainedPerIncident).toFixed(1);

  // --- 6. Confidence ---
  const confidence = confidenceLabel(valid.length, trendFactorRaw);

  return {
    dataEndpoint: {
      lastDate: dataEndDate,
      lastDateLabel: fmtDate(dataEndDate),
      firstDateLabel: fmtDate(dataStartDate),
      totalRecords: valid.length,
      daysSpanned: totalDays,
    },
    forecastWindow: {
      start: forecastStart,
      end: forecastEnd,
      days: horizonDays,
      startLabel: fmtDate(forecastStart),
      endLabel: fmtDate(forecastEnd),
    },
    model: {
      overallDailyRate: +overallDailyRate.toFixed(3),
      recentDailyRate: +recentDailyRate.toFixed(3),
      trendFactor: +trendFactor.toFixed(2),
      dowMultiplier: dowMultiplier.map((m) => +m.toFixed(2)),
      monthMultiplier: monthMultiplier.slice(1).map((m) => +m.toFixed(2)),
    },
    when: {
      totalExpectedIncidents: totalExpected,
      peakDay: { date: peak.date, label: fmtDate(peak.date), expected: +peak.expected.toFixed(2) },
      dailyBreakdown: dailyForecast.map((d) => ({ date: d.date, label: fmtDate(d.date), expected: d.expected })),
    },
    where: {
      governorate: risk.topGovernorate,
      location: risk.topLocation,
      riskScore: +risk.topScore.toFixed(3),
      ranking: risk.ranking.slice(0, 5),
    },
    howMany: {
      predictedType,
      expectedDetainedPerIncident: +avgDetainedPerIncident.toFixed(1),
      expectedTotalDetained,
    },
    reasoning: {
      endpoint: `تنتهي البيانات عند آخر سجل في ${fmtDate(dataEndDate)} — التنبؤ يبدأ من اليوم التالي ويمتد ${horizonDays} يوماً`,
      rate: `المعدل اليومي التاريخي ${overallDailyRate.toFixed(2)} حادث/يوم، وآخر 30 يوماً بمعدل ${recentDailyRate.toFixed(2)} (معامل الاتجاه ${trendFactor.toFixed(2)})`,
      seasonal: `نموذج يومي يجمع تأثير يوم الأسبوع والموسم الشهري — ذروة متوقعة في ${fmtDate(peak.date)}`,
      spatial: `${risk.topGovernorate} هي الأعلى مخاطر بناءً على النشاط الأخير والحصة التاريخية لمحاذاة فترة التنبؤ`,
      typeReason: typeRisk.reason,
    },
  };
}

function spatialRisk(incidents, forecastStart, forecastEnd) {
  const now = incidents.length ? incidents[incidents.length - 1]._d : new Date();
  const recentCutoff = new Date(now.getTime() - 90 * DAY_MS);

  const govStats = {};
  const locStats = {};
  for (const r of incidents) {
    const recencyWeight = r._d >= recentCutoff ? 2.0 : 1.0;
    const g = r.governorate || "غير محدد";
    if (!govStats[g]) govStats[g] = { count: 0, weight: 0, detained: 0 };
    govStats[g].count += 1;
    govStats[g].weight += recencyWeight;
    govStats[g].detained += r.detained_count || 0;
    const locKey = `${r.governorate || "غير محدد"}::${r.location_name || "غير محدد"}`;
    if (!locStats[locKey]) locStats[locKey] = { count: 0, weight: 0, governorate: r.governorate, location: r.location_name };
    locStats[locKey].count += 1;
    locStats[locKey].weight += recencyWeight;
  }
  const totalWeight = Object.values(govStats).reduce((a, g) => a + g.weight, 0) || 1;

  // Seasonal alignment: boost governorates whose share aligns with the forecast window months
  const winMonths = new Set();
  for (let d = new Date(forecastStart); d <= forecastEnd; d = addDays(d, 1)) winMonths.add(d.getMonth() + 1);
  const monthGovCounts = {};
  let monthTotal = 0;
  for (const r of incidents) {
    const m = r._d.getMonth() + 1;
    if (winMonths.has(m)) {
      const g = r.governorate || "غير محدد";
      monthGovCounts[g] = (monthGovCounts[g] || 0) + 1;
      monthTotal++;
    }
  }
  monthTotal = monthTotal || 1;

  const ranking = Object.entries(govStats)
    .map(([gov, s]) => {
      const historicalShare = s.weight / totalWeight;
      const seasonalShare = (monthGovCounts[gov] || 0) / monthTotal;
      const score = 0.5 * historicalShare + 0.5 * seasonalShare;
      return { governorate: gov, score, historicalShare: +historicalShare.toFixed(3), seasonalShare: +seasonalShare.toFixed(3), incidents: s.count, detained: s.detained };
    })
    .sort((a, b) => b.score - a.score);

  const topGov = ranking[0];
  const locsInTopGov = Object.entries(locStats)
    .filter(([k]) => k.startsWith(topGov.governorate + "::"))
    .sort((a, b) => b[1].weight - a[1].weight);
  const topLoc = locsInTopGov[0];

  return { topGovernorate: topGov.governorate, topScore: topGov.score, topLocation: topLoc ? topLoc[1].location : null, ranking };
}

function typeRiskModel(incidents, forecastStart, forecastEnd) {
  const winMonths = new Set();
  for (let d = new Date(forecastStart); d <= forecastEnd; d = addDays(d, 1)) winMonths.add(d.getMonth() + 1);
  const monthTypeCounts = { تهريب: 0, تسلل: 0 };
  for (const r of incidents) {
    const m = r._d.getMonth() + 1;
    if (winMonths.has(m)) monthTypeCounts[r.incident_type] = (monthTypeCounts[r.incident_type] || 0) + 1;
  }
  const total = monthTypeCounts["تهريب"] + monthTypeCounts["تسلل"] || 1;
  const topType = monthTypeCounts["تهريب"] >= monthTypeCounts["تسلل"] ? "تهريب" : "تسلل";
  const reason = `في أشهر فترة التنبؤ تاريخياً، ${topType} هو الأكثر شيوعاً (${Math.round((monthTypeCounts[topType] / total) * 100)}%)`;
  return { topType, reason, monthTypeCounts };
}

function confidenceLabel(recordCount, trendFactor) {
  // Higher confidence with more data and a stable trend (trendFactor near 1)
  const stability = 1 - Math.min(1, Math.abs(trendFactor - 1));
  const score = (Math.min(1, recordCount / 300) * 0.6 + stability * 0.4);
  if (score > 0.66) return "عالية";
  if (score > 0.4) return "متوسطة";
  return "منخفضة";
}