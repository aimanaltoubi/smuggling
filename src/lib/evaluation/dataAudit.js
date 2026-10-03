import { toMonthId } from '@/lib/pipeline/ViewsDataLoader';
export default function dataAudit(records) {
  const ids = new Set(), rows = []; let invalidDates = 0, duplicateIds = 0, invalidCounts = 0, missingGovernorates = 0;
  for (const r of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.incident_date || '') || !Number.isFinite(Date.parse(r.incident_date))) { invalidDates++; continue; }
    if (r.incident_id && ids.has(r.incident_id)) { duplicateIds++; continue; }
    if (!Number.isFinite(r.detained_count) || r.detained_count < 0) { invalidCounts++; continue; }
    if (!r.governorate) { missingGovernorates++; continue; }
    if (r.incident_id) ids.add(r.incident_id);
    rows.push(r);
  }
  rows.sort((a, b) => a.incident_date.localeCompare(b.incident_date));
  const months = rows.map(r => toMonthId(r.incident_date)), first = Math.min(...months), last = Math.max(...months);
  return { rows, summary: { original: records.length, usable: rows.length, invalidDates, duplicateIds, invalidCounts, missingGovernorates, months: rows.length ? last - first + 1 : 0, zeroMonths: rows.length ? last - first + 1 - new Set(months).size : 0, start: rows[0]?.incident_date, end: rows.at(-1)?.incident_date } };
}