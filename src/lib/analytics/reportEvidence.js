export function buildReportEvidence(incidents, scope) {
  const monthly = new Map();
  const types = new Map();
  const governorates = new Map();
  const dates = [];
  for (const incident of incidents) {
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
  const months = [...monthly.values()].sort((first, second) => first.label.localeCompare(second.label)).slice(-36);
  return {
    source: "local CSV incident records; no GDELT or news feed",
    scope,
    recordsInScope: incidents.length,
    datedRecords: dates.length,
    observationStart: dates[0] || null,
    observationEnd: dates.at(-1) || null,
    incidentTypes: [...types.values()],
    governorates: [...governorates.values()].sort((first, second) => second.incidents - first.incidents).slice(0, 15),
    recentMonthlyObserved: months,
    monthlyEvidenceStart: months[0]?.label || null,
    monthlyEvidenceEnd: months.at(-1)?.label || null,
    unavailableEvidence: ["news-source credibility", "verified corridor classification", "smuggling commodity classification", "trafficking classification"],
  };
}