import Papa from "papaparse";

const REQUIRED_COLUMNS = [
  "incident_id", "incident_date", "location_name", "governorate",
  "latitude", "longitude", "incident_type", "detained_count",
];
const VALID_TYPES = new Set(["تهريب", "تسلل"]);

export async function parseIncidentCsv(file) {
  const { data, errors, meta } = Papa.parse(await file.text(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const columns = meta.fields || [];
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missingColumns.length) {
    return { rows: [], errors: [`Missing required columns: ${missingColumns.join(", ")}`] };
  }

  const rowErrors = errors.map((error) => `CSV row ${error.row + 2}: ${error.message}`);
  const rows = [];
  data.forEach((row, index) => {
    const rowNumber = index + 2;
    const value = (key) => String(row[key] ?? "").trim();
    const missing = REQUIRED_COLUMNS.filter((column) => !value(column));
    if (missing.length) {
      rowErrors.push(`Row ${rowNumber}: missing ${missing.join(", ")}`);
      return;
    }

    const date = value("incident_date");
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      rowErrors.push(`Row ${rowNumber}: incident_date must be a valid YYYY-MM-DD date`);
      return;
    }

    const latitude = Number(value("latitude"));
    const longitude = Number(value("longitude"));
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      rowErrors.push(`Row ${rowNumber}: invalid latitude or longitude`);
      return;
    }

    const detainedCount = Number(value("detained_count"));
    if (!Number.isInteger(detainedCount) || detainedCount < 0) {
      rowErrors.push(`Row ${rowNumber}: detained_count must be a non-negative integer`);
      return;
    }

    const incidentType = value("incident_type");
    if (!VALID_TYPES.has(incidentType)) {
      rowErrors.push(`Row ${rowNumber}: incident_type must be تهريب or تسلل`);
      return;
    }

    rows.push({
      incident_id: value("incident_id"),
      incident_date: date,
      location_name: value("location_name"),
      governorate: value("governorate"),
      latitude,
      longitude,
      incident_type: incidentType,
      detained_count: detainedCount,
      ethnicity: value("ethnicity"),
      details: value("details"),
    });
  });
  return { rows, errors: rowErrors };
}