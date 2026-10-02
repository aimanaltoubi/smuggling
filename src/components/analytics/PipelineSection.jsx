import React, { useState } from "react";
import { Database, Cog, GitBranch, BarChart3, FileText, Layers, Play, Loader2, CheckCircle2, Boxes } from "lucide-react";
import { runPipeline, runEnsemble, MODEL_REGISTRY, ENSEMBLES, listModels, modelFamilies } from "@/lib/pipeline";
import { EnsembleSpec } from "@/lib/pipeline/EnsembleManager";

const STAGES = [
  { id: "data", label: "ViewsDataLoader", desc: "Queryset → Drift → Partition", icon: Database },
  { id: "train", label: "TrainingStage", desc: "Model fit → artifact", icon: Cog },
  { id: "evaluate", label: "EvaluationStage", desc: "Step/Month/TS metrics", icon: BarChart3 },
  { id: "forecast", label: "ForecastingStage", desc: "Post-process → validate", icon: GitBranch },
  { id: "reconcile", label: "ReconciliationModule", desc: "Grid ↔ Governorate", icon: Layers },
  { id: "report", label: "ReportingStage", desc: "HTML report + provenance", icon: FileText },
];

const FAMILIES = modelFamilies();

export default function PipelineSection({ incidents }) {
  const [target, setTarget] = useState("detained_count");
  const [level, setLevel] = useState("governorate");
  const [horizon, setHorizon] = useState(36);
  const [mode, setMode] = useState("single"); // "single" | "ensemble"
  const [modelName, setModelName] = useState("AverageModel");
  const [ensembleName, setEnsembleName] = useState("cruel_summer");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const canRun = incidents && incidents.length > 10;
  const modelInfo = MODEL_REGISTRY[modelName];

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 50));
      let res;
      if (mode === "ensemble") {
        const members = ENSEMBLES[ensembleName] || [modelName];
        res = runEnsemble(incidents, new EnsembleSpec(ensembleName, members, null, true), { target, level });
        // wrap so the existing result rendering works
        res = { ensemble: res, stages: ["data", "train", "evaluate", "forecast", "reconcile"],
                forecast: { projections: res.projections || [], reconciliation: res.reconciliation },
                report: { provenance: { run_id: ensembleName, model_name: `ensemble:${ensembleName}`,
                          stages_run: ["train", "evaluate", "forecast", "reconcile"],
                          generated_at: new Date().toISOString() } } };
      } else {
        res = runPipeline(incidents, { model_name: modelName, target, level, horizon_months: horizon });
      }
      setResult(res);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const tsMetrics = result?.evaluate?.ts_metrics || {};
  const projections = result?.forecast?.projections || [];
  const reconciliation = result?.forecast?.reconciliation || null;
  const provenance = result?.report?.provenance || null;

  const btn = (active) => `px-3 py-1.5 rounded-lg text-sm ${active ? "bg-slate-900 text-white" : "bg-muted"}`;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Architecture diagram */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">محرك التنبؤ — أنبوب MLOps (ViEWS-inspired) — هذا هو المحرك الذي ينتج كل التوقعات في النظام</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const active = result?.stages?.includes(s.id) || (s.id === "data" && result) || (s.id === "reconcile" && reconciliation);
            return (
              <div key={s.id} className={`rounded-lg border p-2 text-center ${active ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border"}`}>
                <Icon className="w-5 h-5 mx-auto mb-1 text-slate-700 dark:text-slate-300" />
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                {active && <CheckCircle2 className="w-3 h-3 mx-auto mt-1 text-green-600" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">إعداد التشغيل</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground self-center">الوضع:</span>
            <button onClick={() => setMode("single")} className={btn(mode === "single")}>نموذج واحد</button>
            <button onClick={() => setMode("ensemble")} className={btn(mode === "ensemble")}>مجموعة (Ensemble)</button>
          </div>
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground self-center">الهدف:</span>
            <button onClick={() => setTarget("detained_count")} className={btn(target === "detained_count")}>المعتقلون</button>
            <button onClick={() => setTarget("incidents")} className={btn(target === "incidents")}>عدد الحوادث</button>
          </div>
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground self-center">المستوى:</span>
            <button onClick={() => setLevel("governorate")} className={btn(level === "governorate")}>محافظة</button>
            <button onClick={() => setLevel("priogrid")} className={btn(level === "priogrid")}>PRIO-GRID</button>
          </div>
          {mode === "single" && (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">أفق (أشهر):</span>
              <input type="number" value={horizon} onChange={(e) => setHorizon(parseInt(e.target.value) || 36)}
                className="w-16 px-2 py-1 rounded border border-border text-sm" />
            </div>
          )}
          <button onClick={handleRun} disabled={!canRun || running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "جاري التشغيل..." : "تشغيل الأنبوب"}
          </button>
        </div>

        {/* Model / ensemble selector */}
        {mode === "single" ? (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">النموذج (من كتالوج VIEWS):</span>
            <div className="flex flex-wrap gap-2">
              {listModels().map((m) => {
                const info = MODEL_REGISTRY[m];
                const active = modelName === m;
                return (
                  <button key={m} onClick={() => setModelName(m)} disabled={!info.available}
                    className={`px-2.5 py-1 rounded-lg text-xs border ${active ? "bg-slate-900 text-white border-slate-900" : "border-border"} ${!info.available ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"}`}
                    title={info.available ? "متاح في المتصفح" : "يعمل في مرجع Python فقط"}>
                    {m}
                    <span className="mr-1 text-[10px]">{info.available ? "✓" : "🐍"}</span>
                  </button>
                );
              })}
            </div>
            {modelInfo && !modelInfo.available && (
              <p className="text-xs text-amber-600">
                «{modelName}» يعمل في مرجع Python فقط (يتطلب مكتبات ML أصلية). المعاينة الحية تستخدم AverageModel كبدائل. شغّل الأنبوب الكامل عبر <code className="bg-muted px-1 rounded">python -m pipeline.pipeline --model {modelName}</code>.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">المجموعة (من views-models/ensembles):</span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ENSEMBLES).map((name) => (
                <button key={name} onClick={() => setEnsembleName(name)}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${ensembleName === name ? "bg-slate-900 text-white border-slate-900" : "border-border hover:bg-muted"}`}>
                  {name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              الأعضاء: {(ENSEMBLES[ensembleName] || []).join("، ")} — الترجيح يعتمد على RMSE التحقق (pool-based).
            </p>
          </div>
        )}
        {!canRun && <p className="text-xs text-amber-600">يلزم أكثر من 10 سجلات لتشغيل الأنبوب</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Provenance */}
          {provenance && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">Provenance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-muted-foreground">run_id:</span> {provenance.run_id}</div>
                <div><span className="text-muted-foreground">model:</span> {provenance.model_name}</div>
                <div><span className="text-muted-foreground">المراحل:</span> {provenance.stages_run.join(" → ")}</div>
                <div><span className="text-muted-foreground">الوقت:</span> {new Date(provenance.generated_at).toLocaleString("ar")}</div>
              </div>
            </div>
          )}

          {/* Training log */}
          {result.train && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">TrainingStage — سجل التدريب</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-muted-foreground">نقاط التدريب:</span> {result.train.training_log.n_train_points}</div>
                <div><span className="text-muted-foreground">الهدف:</span> {result.train.training_log.target}</div>
                <div><span className="text-muted-foreground">المستوى:</span> {result.train.training_log.level}</div>
                <div><span className="text-muted-foreground">النموذج:</span> {result.train.training_log.model_name}</div>
                <div><span className="text-muted-foreground">العائلة:</span> {result.train.artifact.model_family}</div>
                <div><span className="text-muted-foreground">الكيانات:</span> {result.train.training_log.n_entities}</div>
              </div>
              {result.train.training_log.note && (
                <p className="text-xs text-amber-600 mt-2">{result.train.training_log.note}</p>
              )}
            </div>
          )}

          {/* Ensemble weights */}
          {result.ensemble && result.ensemble.weights && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">EnsembleManager — أوزان المجموعة</h3>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">الطريقة:</span> {result.ensemble.weighting_method}</div>
                <table className="w-full text-sm mt-1">
                  <thead><tr className="border-b"><th className="text-right py-1">العضو</th><th className="text-right py-1">الوزن</th></tr></thead>
                  <tbody>
                    {result.ensemble.members.map((m, i) => (
                      <tr key={m} className="border-b border-border/50">
                        <td className="py-1">{m}</td>
                        <td className="py-1 font-mono">{(result.ensemble.weights[i] * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Evaluation metrics */}
          {Object.keys(tsMetrics).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">EvaluationStage — المقاييس</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-right py-1">المقياس</th><th className="text-right py-1">القيمة</th></tr></thead>
                <tbody>
                  {Object.entries(tsMetrics).map(([k, v]) => (
                    <tr key={k} className="border-b border-border/50">
                      <td className="py-1">{k}</td>
                      <td className="py-1 font-mono">{typeof v === "number" ? v.toFixed(4) : v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Forecast projections */}
          {projections.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">ForecastingStage — التوقعات ({projections.length} شهراً)</h3>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b sticky top-0 bg-card">
                    <th className="text-right py-1">month_id</th><th className="text-right py-1">القيمة</th>
                    <th className="text-right py-1">الحد الأدنى</th><th className="text-right py-1">الحد الأعلى</th>
                  </tr></thead>
                  <tbody>
                    {projections.slice(0, 24).map((p, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1 font-mono">{p.month_id}</td>
                        <td className="py-1 font-mono font-semibold">{p.value.toFixed(2)}</td>
                        <td className="py-1 font-mono text-muted-foreground">{p.ci_lower.toFixed(2)}</td>
                        <td className="py-1 font-mono text-muted-foreground">{p.ci_upper.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.forecast.validated && <p className="text-xs text-green-600 mt-2">✓ تم التحقق: قيم غير سالبة ومنتهية</p>}
            </div>
          )}

          {/* Reconciliation */}
          {reconciliation && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">ReconciliationModule — التسوية الهرمية</h3>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">الطريقة:</span> {reconciliation.method}</div>
                <div><span className="text-muted-foreground">عدد الأشهر:</span> {reconciliation.n_months}</div>
                <div><span className="text-muted-foreground">حفظ التضخم الصفري:</span> {reconciliation.zero_inflation_preserved ? "نعم" : "لا"}</div>
              </div>
            </div>
          )}

          {/* Report */}
          {result.report && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold mb-2">ReportingStage — تقرير HTML</h3>
              <p className="text-sm text-muted-foreground mb-2">طول التقرير: {result.report.html_length} حرف</p>
              <details>
                <summary className="text-sm cursor-pointer text-slate-700 dark:text-slate-300">معاينة HTML</summary>
                <iframe srcDoc={result.report.report_html} className="w-full h-96 mt-2 rounded border border-border" title="report preview" />
              </details>
            </div>
          )}
        </>
      )}
    </div>
  );
}