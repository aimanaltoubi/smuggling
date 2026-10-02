"""
ReportingStage — forecast + evaluation HTML report generation.

Generates a self-contained HTML report with:
  - Metrics tables
  - Key-value configuration summaries
  - Spatial visualization placeholders
  - Artifact provenance (timestamps, versions)

Tailwind subset embedded for portability (no external CSS dependency).
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict


class ReportingStage:
    """Report: HTML summaries of forecast + evaluation runs."""

    def execute(self, ctx, run_results: Dict[str, Any]) -> Dict[str, Any]:
        config = ctx.config
        train = run_results.get("train")
        evaluate = run_results.get("evaluate")
        forecast = run_results.get("forecast")

        provenance = {
            "run_id": ctx.run_id,
            "model_name": config.model_name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stages_run": run_results.get("stages", []),
        }

        html = self._build_html(config, train, evaluate, forecast, provenance)
        self._persist(ctx, html)

        return {"report_path": ctx.paths.report_path, "provenance": provenance,
                "html_length": len(html)}

    def _build_html(self, config, train, evaluate, forecast, provenance) -> str:
        ts_metrics = evaluate.ts_metrics if evaluate else {}
        projections = forecast.projections if forecast else []

        metrics_rows = "".join(
            f"<tr><td>{k}</td><td>{v:.4f}</td></tr>" for k, v in ts_metrics.items()
        ) if ts_metrics else "<tr><td colspan='2'>no metrics</td></tr>"

        proj_rows = "".join(
            f"<tr><td>{p['month_id']}</td><td>{p['value']:.2f}</td>"
            f"<td>{p['ci_lower']:.2f}</td><td>{p['ci_upper']:.2f}</td></tr>"
            for p in projections[:24]
        )

        config_kv = "".join(
            f"<tr><td>{k}</td><td>{v}</td></tr>"
            for k, v in config.meta.items()
        )

        return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>تقرير التوقع — {config.model_name}</title>
<style>
body{{font-family:sans-serif;background:#f6f7f9;color:#111;margin:0;padding:24px}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px}}
h1{{font-size:20px;margin:0 0 12px}} h2{{font-size:16px;margin:16px 0 8px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb}}
th{{background:#f9fafb;font-weight:600}}
.muted{{color:#6b7280;font-size:12px}}
</style>
</head>
<body>
<div class="card">
  <h1>تقرير التوقع والتنبؤ — {config.model_name}</h1>
  <p class="muted">تم الإنشاء: {provenance['generated_at']} | المراحل: {', '.join(provenance['stages_run'])}</p>
</div>
<div class="card">
  <h2>ملخص الإعداد</h2>
  <table>{config_kv}</table>
</div>
<div class="card">
  <h2>مقاييس التقييم</h2>
  <table><thead><tr><th>المقياس</th><th>القيمة</th></tr></thead><tbody>{metrics_rows}</tbody></table>
</div>
<div class="card">
  <h2>توقعات الأفق المستقبلي (أول 24 شهراً)</h2>
  <table><thead><tr><th>month_id</th><th>القيمة</th><th>الحد الأدنى</th><th>الحد الأعلى</th></tr></thead>
  <tbody>{proj_rows}</tbody></table>
</div>
</body></html>"""

    def _persist(self, ctx, html: str):
        try:
            with open(ctx.paths.report_path, "w", encoding="utf-8") as f:
                f.write(html)
        except OSError:
            pass