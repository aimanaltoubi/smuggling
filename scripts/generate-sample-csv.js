import { mkdirSync, writeFileSync } from "node:fs";
import { generateSyntheticIncidents } from "../src/lib/evaluation/syntheticData.js";

const columns = [
  "incident_id",
  "incident_date",
  "location_name",
  "governorate",
  "latitude",
  "longitude",
  "incident_type",
  "ethnicity",
  "detained_count",
  "details",
];

const escapeCsv = value => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const incidents = generateSyntheticIncidents({
  startDate: "2021-01-01",
  endDate: "2024-12-31",
  seed: 42,
  trendPerMonth: 0,
});
const rows = incidents.map(incident => ({
  ...incident,
  ethnicity: "",
  details: "Synthetic test record",
}));
const csv = [
  columns.join(","),
  ...rows.map(row => columns.map(column => escapeCsv(row[column])).join(",")),
].join("\r\n");

mkdirSync("public", { recursive: true });
writeFileSync("public/sample-incidents.csv", `\uFEFF${csv}\r\n`);
console.log(`Wrote ${rows.length} synthetic incident rows to public/sample-incidents.csv`);