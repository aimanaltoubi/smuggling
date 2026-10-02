/**
 * PanelBuilder — converts loader rows into a (month_id, entity_id) panel
 * suitable for the VIEWS-compatible baseline models.
 *
 * JS port of python_reference/pipeline/data/panel.py.
 * Aggregation per (month_id, entity_id):
 *   incidents     → count of rows
 *   detained_count → sum of detained_count
 */

export function rowsToPanel(rows, target = "detained_count", level = "governorate") {
  // Map keyed by `${month_id}::${entity_id}` → { month_id, entity_id, incidents, detained_count }
  const map = new Map();
  for (const r of rows || []) {
    if (r.month_id == null || r.entity_id == null) continue;
    const key = `${r.month_id}::${r.entity_id}`;
    if (!map.has(key)) {
      map.set(key, { month_id: r.month_id, entity_id: r.entity_id, incidents: 0, detained_count: 0 });
    }
    const cell = map.get(key);
    cell.incidents += 1;
    cell.detained_count += r.detained_count || 0;
  }
  const cells = [...map.values()].sort(
    (a, b) => a.month_id - b.month_id || String(a.entity_id).localeCompare(String(b.entity_id))
  );
  return { cells, target };
}

/**
 * Group panel cells by entity_id, sorted by month_id.
 * Returns Map<entity_id, Array<{month_id, incidents, detained_count}>>
 */
export function panelByEntity(panel) {
  const byEnt = new Map();
  for (const c of panel.cells) {
    if (!byEnt.has(c.entity_id)) byEnt.set(c.entity_id, []);
    byEnt.get(c.entity_id).push(c);
  }
  for (const arr of byEnt.values()) arr.sort((a, b) => a.month_id - b.month_id);
  return byEnt;
}

/**
 * All unique entity_ids in the panel.
 */
export function panelEntities(panel) {
  return [...new Set(panel.cells.map((c) => c.entity_id))].sort();
}

/**
 * All unique month_ids in the panel, sorted.
 */
export function panelMonths(panel) {
  return [...new Set(panel.cells.map((c) => c.month_id))].sort((a, b) => a - b);
}