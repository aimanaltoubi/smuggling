import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_url, replace_existing } = body;

    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    const incidentSchema = {
      type: "object",
      properties: {
        incident_id: { type: "string" },
        incident_date: { type: "string", format: "date" },
        location_name: { type: "string" },
        governorate: { type: "string" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        incident_type: { type: "string", enum: ["تهريب", "تسلل"] },
        ethnicity: { type: "string" },
        detained_count: { type: "integer" },
        details: { type: "string" },
      },
      required: ["incident_id", "incident_date", "location_name", "governorate", "latitude", "longitude", "incident_type", "detained_count"],
    };

    const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: incidentSchema,
    });

    if (result.status === "error") {
      return Response.json({ error: result.details || "Extraction failed" }, { status: 422 });
    }

    let rows = result.output;
    if (!rows) return Response.json({ error: "No data found in file" }, { status: 422 });
    if (!Array.isArray(rows)) rows = [rows];

    const validTypes = ["تهريب", "تسلل"];
    const valid: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const rowNum = i + 2;
      const missing: string[] = [];

      for (const f of ["incident_id", "incident_date", "location_name", "governorate", "latitude", "longitude", "incident_type", "detained_count"]) {
        if (row[f] == null || row[f] === "") missing.push(f);
      }
      if (missing.length) {
        errors.push(`صف ${rowNum}: أعمدة ناقصة — ${missing.join(", ")}`);
        continue;
      }

      const incidentType = String(row.incident_type).trim();
      if (!validTypes.includes(incidentType)) {
        errors.push(`صف ${rowNum}: نوع الحادث يجب أن يكون "تهريب" أو "تسلل" — وجد "${incidentType}"`);
        continue;
      }

      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!isFinite(lat) || !isFinite(lng)) {
        errors.push(`صف ${rowNum}: إحداثيات غير صالحة`);
        continue;
      }

      const detained = parseInt(String(row.detained_count), 10);
      if (isNaN(detained)) {
        errors.push(`صف ${rowNum}: عدد المعتقلين غير صالح`);
        continue;
      }

      const dateStr = String(row.incident_date).trim();
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        errors.push(`صف ${rowNum}: تاريخ غير صالح "${dateStr}"`);
        continue;
      }
      const normalizedDate = date.toISOString().split("T")[0];

      const record: any = {
        incident_id: String(row.incident_id).trim(),
        incident_date: normalizedDate,
        location_name: String(row.location_name).trim(),
        governorate: String(row.governorate).trim(),
        latitude: lat,
        longitude: lng,
        incident_type: incidentType,
        detained_count: detained,
      };
      if (row.ethnicity) record.ethnicity = String(row.ethnicity).trim();
      if (row.details) record.details = String(row.details).trim();
      valid.push(record);
    }

    if (!valid.length) {
      return Response.json({ error: "لا توجد صفوف صالحة للاستيراد", errors }, { status: 422 });
    }

    if (replace_existing) {
      await base44.entities.Incident.deleteMany({});
    }

    await base44.entities.Incident.bulkCreate(valid);

    return Response.json({
      imported: valid.length,
      failed: errors.length,
      errors: errors.slice(0, 20),
      replaced: !!replace_existing,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}