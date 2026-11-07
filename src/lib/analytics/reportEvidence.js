export function buildMonthlyObservationSeries(incidents) {
  const groups = new Map();
  for (const incident of incidents) {
    if (!incident.incident_date) continue;
    const date = new Date(incident.incident_date);
    if (!Number.isFinite(date.getTime())) continue;
    const label = date.toISOString().slice(0, 7);
    const group = groups.get(label) || { label, incidents: 0, detained: 0, assumedZero: false };
    group.incidents += 1;
    group.detained += Number(incident.detained_count) || 0;
    groups.set(label, group);
  }
  const periods = [...groups.keys()].sort();
  if (!periods.length) return [];
  const months = [];
  const end = periods.at(-1);
  for (let date = new Date(`${periods[0]}-01T00:00:00Z`); date.toISOString().slice(0, 7) <= end; date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))) {
    const label = date.toISOString().slice(0, 7);
    months.push(groups.get(label) || { label, incidents: 0, detained: 0, assumedZero: true });
  }
  return months;
}

export function buildReportEvidence(incidents, scope) {
  const monthly = new Map();
  const types = new Map();
  const governorates = new Map();
  const dates = [];
  for (const incident of incidents) {
    if (!incident.incident_date) continue;
    const date = new Date(incident.incident_date);
    if (!Number.isFinite(date.getTime())) continue;
    const dateLabel = date.toISOString().slice(0, 10);
    dates.push(dateLabel);
    const detained = Number(incident.detained_count) || 0;
    for (const [groups, key] of [[monthly, dateLabel.slice(0, 7)], [types, incident.incident_type], [governorates, incident.governorate]]) {
      if (!key) continue;
      const group = groups.get(key) || { label: key, incidents: 0, detained: 0 };
      group.incidents += 1;
      group.detained += detained;
      groups.set(key, group);
    }
  }
  dates.sort();
  const months = buildMonthlyObservationSeries(incidents);
  const totalDetained = [...types.values()].reduce((total, type) => total + type.detained, 0);
  const groupValues = groups => [...groups.values()].map(group => ({ ...group, incidentSharePercent: dates.length ? +(group.incidents / dates.length * 100).toFixed(2) : 0 }));
  return {
    source: "local CSV incident records",
    scope,
    recordsInScope: incidents.length,
    datedRecords: dates.length,
    observationStart: dates[0] || null,
    observationEnd: dates.at(-1) || null,
    incidentTypes: groupValues(types),
    governorates: groupValues(governorates).sort((first, second) => second.incidents - first.incidents).slice(0, 15),
    recentMonthlyObserved: months,
    totalDetained,
    detaineesPerIncident: dates.length ? +(totalDetained / dates.length).toFixed(2) : null,
    calendarMonths: months.length,
    assumedZeroMonths: months.filter(month => month.assumedZero).length,
    coverageAssumption: "Absent records are treated as zero within the first-to-last reporting month, as in the model panel; reporting completeness is not independently verified.",
    monthlyEvidenceStart: months[0]?.label || null,
    monthlyEvidenceEnd: months.at(-1)?.label || null,
  };
}