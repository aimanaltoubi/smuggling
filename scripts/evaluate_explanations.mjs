import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { buildReportEvidence } from "../src/lib/analytics/reportEvidence.js";

const require = createRequire(import.meta.url);
const { createExplanationRequest, evaluateExplanation, buildGroundedExplanation } = require("../electron/explanationRequest.cjs");
const endpoint = new URL(process.argv[2] || "http://127.0.0.1:8099");
if (!["127.0.0.1", "localhost"].includes(endpoint.hostname)) throw new Error("Evaluation must use a local model endpoint.");
const records = Array.from({ length: 11 }, (_, index) => ({
  incident_date: `2026-${String(index + 2).padStart(2, "0")}-11`,
  incident_type: "تهريب", governorate: "محافظة البريمي", detained_count: index % 3 + 1,
}));
const baseFacts = {
  forecast: "monthly strategic", target: "عدد الحوادث", incidentType: "تهريب",
  observedEvidence: buildReportEvidence(records, "تهريب فقط"),
  historyStart: "2026-02", historyEnd: "2026-12",
  projectedMonthlyValues: [
    { period: "2027-01", value: 12, experimentalLower80: 8, experimentalUpper80: 15 },
    { period: "2027-02", value: 15, experimentalLower80: 10, experimentalUpper80: 20 },
    { period: "2027-03", value: 9, experimentalLower80: 6, experimentalUpper80: 12 },
  ],
  selectedCandidates: [{ id: "recent-3" }], validatedHorizonMonths: 6, validationRmse: 4.714,
  intervalInterpretation: "Experimental 80% ranges, not calibrated probability guarantees.",
};
const cases = [
  { id: "smuggling-summary", format: "summary", facts: baseFacts },
  { id: "detainees-summary", format: "summary", facts: { ...baseFacts, target: "عدد المعتقلين" } },
  { id: "single-type-report", format: "report", facts: baseFacts },
];
const results = [];
for (const item of cases) {
  const request = createExplanationRequest(item.facts, item.format);
  const started = Date.now();
  const response = await fetch(new URL("/v1/chat/completions", endpoint), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`Local model HTTP ${response.status}: ${await response.text()}`);
  const generated = await response.json();
  const text = generated.choices?.[0]?.message?.content || "";
  const evaluation = evaluateExplanation(text, item.facts, item.format);
  if (generated.choices?.[0]?.finish_reason === "length") { evaluation.passed = false; evaluation.issues.push("truncated output"); }
  const acceptedText = evaluation.passed ? text : buildGroundedExplanation(item.facts, item.format);
  const acceptedEvaluation = evaluateExplanation(acceptedText, item.facts, item.format);
  results.push({ id: item.id, format: item.format, facts: item.facts, text, acceptedText, acceptedMethod: evaluation.passed ? "local-model" : "grounded-template", elapsedMs: Date.now() - started, evaluation, acceptedEvaluation });
  console.log(`${item.id}: ${evaluation.passed ? "PASS" : "REJECT"} ${evaluation.issues.join("; ")}`);
  console.log(text);
  console.log(`Accepted result: ${acceptedEvaluation.passed ? "PASS" : "FAIL"} (${evaluation.passed ? "model" : "grounded fallback"})`);
}
await mkdir("build", { recursive: true });
await writeFile("build/explanation-evaluation.json", JSON.stringify({ model: "Qwen 2.5 1.5B Q4_K_M", provenance: "Synthetic evaluation facts, not operational data", generatedAt: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`Model passed ${results.filter(result => result.evaluation.passed).length}/${results.length}; accepted pipeline passed ${results.filter(result => result.acceptedEvaluation.passed).length}/${results.length}; wrote build/explanation-evaluation.json`);
if (results.some(result => !result.acceptedEvaluation.passed)) process.exitCode = 1;