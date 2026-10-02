// Data loader for the Incident entity - fetches all incidents for analytics.
import { base44 } from "@/api/base44Client";

export async function loadIncidents() {
  const all = [];
  let cursor = null;
  // Page through all records using list with sort + limit
  let batch = await base44.entities.Incident.list("-incident_date", 500);
  all.push(...batch);
  // If fewer than limit, we have everything; otherwise keep paging by date offset
  while (batch.length === 500) {
    const oldest = batch[batch.length - 1];
    batch = await base44.entities.Incident.filter(
      { incident_date: { $lt: oldest.incident_date } },
      "-incident_date",
      500
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}