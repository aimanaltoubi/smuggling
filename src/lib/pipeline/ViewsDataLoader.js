/**
 * ViewsDataLoader — queryset-driven data fetch with drift detection and partition slicing.
 *
 * month_id follows the ViEWS convention: months since Jan 1960.
 *   month_id = (year - 1960) * 12 + month
 */

export function toMonthId(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) throw new Error(`Cannot convert ${d} to month_id`);
  return (dt.getFullYear() - 1960) * 12 + (dt.getMonth() + 1);
}

export function monthIdToDate(mid) {
  const y = 1960 + Math.floor((mid - 1) / 12);
  const m = ((mid - 1) % 12) + 1;
  return new Date(y, m - 1, 1);
}

function prioid(r) {
  const { latitude: lat, longitude: lng } = r;
  if (lat == null || lng == null) return "unknown";
  const col = Math.floor((lng + 180) / 0.5) + 1;
  const row = Math.floor((lat + 90) / 0.5) + 1;
  return `pg${(row - 1) * 720 + col}`;
}

export default class ViewsDataLoader {
  constructor(queryset = { entity: "Incident", filters: {} }) {
    this.queryset = queryset;
  }

  fetchRaw(records) {
    return records.filter((r) => this._matchesQueryset(r));
  }

  _matchesQueryset(record) {
    const filters = this.queryset.filters || {};
    return Object.entries(filters).every(([k, v]) => record[k] === v);
  }

  toFrame(records, level = "governorate") {
    return records.map((r) => ({
      month_id: toMonthId(r.incident_date),
      entity_id: level === "governorate" ? (r.governorate || "unknown") : prioid(r),
      incident_type: r.incident_type,
      detained_count: r.detained_count || 0,
      latitude: r.latitude,
      longitude: r.longitude,
      raw: r,
    }));
  }

  checkDrift(current, reference = null) {
    if (!reference || !reference.length)
      return { has_drift: false, details: { note: "no reference snapshot" } };

    const curCount = current.length;
    const refCount = reference.length;
    const countRatio = refCount ? curCount / refCount : 0;

    const typeDist = (recs) => {
      const d = {};
      for (const r of recs) { const t = r.incident_type || "unknown"; d[t] = (d[t] || 0) + 1; }
      return d;
    };
    const curTypes = typeDist(current);
    const refTypes = typeDist(reference);
    const allTypes = new Set([...Object.keys(curTypes), ...Object.keys(refTypes)]);
    let typeDrift = 0;
    for (const t of allTypes) {
      const cp = (curTypes[t] || 0) / Math.max(1, curCount);
      const rp = (refTypes[t] || 0) / Math.max(1, refCount);
      typeDrift += Math.abs(cp - rp);
    }
    typeDrift /= Math.max(1, allTypes.size);

    const has_drift = Math.abs(countRatio - 1) > 0.3 || typeDrift > 0.15;
    return { has_drift, details: { count_ratio: +countRatio.toFixed(3), type_drift: +typeDrift.toFixed(3) } };
  }

  partition(rows, partitions) {
    return {
      train: rows.filter((r) => r.month_id >= partitions.train_start && r.month_id <= partitions.train_end),
      calibration: rows.filter((r) => r.month_id >= partitions.calibration_start && r.month_id <= partitions.calibration_end),
      validation: rows.filter((r) => r.month_id >= partitions.validation_start && r.month_id <= partitions.validation_end),
      forecast: rows.filter((r) => r.month_id >= partitions.forecast_start),
    };
  }

  load(records, partitions, level = "governorate", reference = null) {
    const raw = this.fetchRaw(records);
    const drift = this.checkDrift(raw, reference);
    const frame = this.toFrame(raw, level);
    const slices = this.partition(frame, partitions);
    return { raw, frame, partitions: slices, drift, n_records: raw.length };
  }
}