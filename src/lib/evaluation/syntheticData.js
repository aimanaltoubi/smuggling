/**
 * Synthetic incident data generator with KNOWN ground-truth patterns.
 *
 * Patterns embedded (so we can verify the pipeline recovers them):
 *   - Seasonality: summer peak (Jun–Sep), winter low (Dec–Feb)
 *   - Geographic: 5 governorates with distinct base rates
 *   - Trend: slight upward (+2%/month)
 *   - Type split: 60% تهريب, 40% تسلل
 *   - Detained: Poisson(λ=2) + 1 per incident
 *
 * Deterministic (seeded RNG) so evaluation is reproducible.
 */

const DAY_MS = 24 * 3600 * 1000;

const GOV_PROFILES = [
  { name: "شمال الباطنة", lat: 24.3, lng: 56.9, baseRate: 9 },
  { name: "جنوب الشرقية", lat: 22.5, lng: 58.5, baseRate: 6 },
  { name: "ظفار", lat: 17.0, lng: 54.1, baseRate: 7 },
  { name: "البريمي", lat: 24.0, lng: 55.8, baseRate: 3 },
  { name: "مسندم", lat: 26.0, lng: 56.2, baseRate: 2 },
];

// Monthly seasonal multipliers (index 0 = January)
const SEASONAL = [0.55, 0.50, 0.70, 0.90, 1.25, 1.55, 1.85, 1.70, 1.35, 1.00, 0.70, 0.50];

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function poisson(rng, lambda) {
  if (lambda < 8) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }
  // normal approximation for larger lambdas
  const u1 = rng(), u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
}

export function generateSyntheticIncidents(opts = {}) {
  const {
    startDate = "2022-01-01",
    endDate = "2024-12-31",
    seed = 42,
    trendPerMonth = 0.02,
    smugglingRatio = 0.60,
    noise = 0, rateScale = 1, shockMultiplier = 1, shiftMonth = 30,
    spatialShift = false, typeShift = false,
  } = opts;

  const rng = makeRng(seed);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.round((end - start) / DAY_MS) + 1;

  const incidents = [];
  let id = 1;

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(start.getTime() + d * DAY_MS);
    const month = date.getMonth();
    const monthIdx = d / 30; // approximate month index for trend

    for (const gov of GOV_PROFILES) {
      const seasonalMult = SEASONAL[month];
      const trendMult = Math.max(0.05, 1 + trendPerMonth * monthIdx);
      const shifted = monthIdx >= shiftMonth;
      const spatial = spatialShift && shifted ? (gov.name === 'مسندم' ? 5 : 0.6) : 1;
      const disturbance = noise ? Math.exp(noise * (2 * rng() - 1)) : 1;
      const monthlyRate = gov.baseRate * seasonalMult * trendMult * rateScale * spatial * disturbance * (shifted ? shockMultiplier : 1);
      const dailyRate = monthlyRate / 30;
      const count = poisson(rng, dailyRate);

      for (let i = 0; i < count; i++) {
        const isSmuggling = rng() < (typeShift && monthIdx >= shiftMonth ? 1 - smugglingRatio : smugglingRatio);
        const detained = Math.max(1, poisson(rng, 2) + 1);
        incidents.push({
          incident_id: `SYN-${String(id++).padStart(5, "0")}`,
          incident_date: date.toISOString().split("T")[0],
          location_name: `ولاية ${gov.name}`,
          governorate: gov.name,
          latitude: +(gov.lat + (rng() - 0.5) * 0.4).toFixed(4),
          longitude: +(gov.lng + (rng() - 0.5) * 0.4).toFixed(4),
          incident_type: isSmuggling ? "تهريب" : "تسلل",
          detained_count: detained,
        });
      }
    }
  }

  return incidents;
}

export function getGroundTruth() {
  return {
    seasonalPattern: "ذروة صيفية (يونيو-سبتمبر)",
    trend: `اتجاه تصاعدي ${"2%/شهر"}`,
    typeSplit: `60% تهريب / 40% تسلل`,
    governorates: GOV_PROFILES.map((g) => ({
      name: g.name,
      baseRate: g.baseRate,
      coords: { lat: g.lat, lng: g.lng },
    })),
    expectedTopGov: "شمال الباطنة",
    expectedPeakMonths: ["يونيو", "يوليو", "أغسطس"],
  };
}