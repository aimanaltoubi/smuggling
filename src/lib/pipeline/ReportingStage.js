/**
 * ReportingStage — forecast + evaluation HTML report generation.
 * Generates a self-contained HTML string with metrics tables, config summaries,
 * and artifact provenance. Tailwind subset embedded for portability.
 */

export default class ReportingStage {
  execute(ctx, runResults) {
    const config = ctx.config;
    const evaluate = runResults.evaluate;
    const forecast = runResults.forecast;

    const provenance = {
      run_id: ctx.run_id,
      model_name: config.model_name,
      generated_at: new Date().toISOString(),
      stages_run: runResults.stages || [],
    };

    const tsMetrics = evaluate?.ts_metrics || {};
    const projections = forecast?.projections || [];

    const metricsRows = Object.keys(tsMetrics).length
      ? Object.entries(tsMetrics).map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === "number" ? v.toFixed(4) : v}</td></tr>`).join("")
      : "<tr><td colspan='2'>no metrics</td></tr>";

    const projRows = projections.slice(0, 24).map((p) =>
      `<tr><td>${p.month_id}</td><td>${p.value.toFixed(2)}</td><td>${p.ci_lower.toFixed(2)}</td><td>${p.ci_upper.toFixed(2)}</td></tr>`
    ).join("");

    const configKv = Object.entries(config.meta).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>تقرير التوقع — ${config.model_name}</title>
<style>body{font-family:sans-serif;background:#f6f7f9;color:#111;margin:0;padding:24px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px}
h1{font-size:20px;margin:0 0 12px} h2{font-size:16px;margin:16px 0 8px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb;font-weight:600}.muted{color:#6b7280;font-size:12px}</style></head>
<body><div class="card"><h1>تقرير التوقع والتنبؤ — ${config.model_name}</h1>
<p class="muted">تم الإنشاء: ${provenance.generated_at} | المراحل: ${provenance.stages_run.join(", ")}</p></div>
<div class="card"><h2>ملخص الإعداد</h2><table>${configKv}</table></div>
<div class="card"><h2>مقاييس التقييم</h2><table><thead><tr><th>المقياس</th><th>القيمة</th></tr></thead><tbody>${metricsRows}</tbody></table></div>
<div class="card"><h2>توقعات الأفق المستقبلي (أول 24 شهراً)</h2><table><thead><tr><th>month_id</th><th>القيمة</th><th>الحد الأدنى</th><th>الحد الأعلى</th></tr></thead><tbody>${projRows}</tbody></table></div></body></html>`;

    return Object.freeze({ report_html: html, provenance, html_length: html.length });
  }
}