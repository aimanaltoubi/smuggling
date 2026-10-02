import React, { useState } from "react";
import { ClipboardCheck, Play, Loader2, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { runComprehensiveEvaluation } from "@/lib/evaluation/evaluator";
import EvaluationVerdict from "./EvaluationVerdict";
import ScenarioSummary from "./ScenarioSummary";
import WeaknessPanel from "./WeaknessPanel";
import FineTuningPanel from "./FineTuningPanel";
import ModelComparisonPanel from "./ModelComparisonPanel";

function accColor(pct) {
  if (pct >= 80) return "text-green-600 bg-green-50 border-green-200";
  if (pct >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

export default function EvaluationSection() {
  const [evaluation, setEvaluation] = useState(null);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    setEvaluation(null);
    setTimeout(() => {
      try {
        const result = runComprehensiveEvaluation();
        setEvaluation(result);
      } catch (e) {
        console.error(e);
      }
      setRunning(false);
    }, 100);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + Run button */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="font-semibold">إطار التقييم الشامل (5 مراحل)</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                اختبار متعدد السيناريوهات • مقاييس معروفة (MAE, RMSE, R², MASE) • كشف الضعف • ضبط دقيق • حكم الموثوقية
              </p>
            </div>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "جاري التقييم الشامل..." : "تشغيل التقييم الشامل"}
          </button>
        </div>
        {running && (
          <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            يجري: 4 سيناريوهات × 6 أشهر backtest + 14 يوم backtest + grid search (5 أوزان)...
          </div>
        )}
      </div>

      {evaluation && (
        <>
          {/* Phase 5: Reliability Verdict */}
          <EvaluationVerdict reliability={evaluation.reliability} />

          {/* Synthetic data summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-3">البيانات الاصطناعية (الحقيقة المعروفة)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <SummaryItem label="عدد السيناريوهات" value={evaluation.syntheticSummary.totalScenarios} />
              <SummaryItem label="إجمالي الحوادث" value={evaluation.syntheticSummary.totalIncidents} />
              <SummaryItem label="المحافظات" value={evaluation.groundTruth.governorates.length} />
              <SummaryItem label="النمط الموسمي" value={evaluation.groundTruth.seasonalPattern} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• الاتجاه: {evaluation.groundTruth.trend}</p>
              <p>• توزيع النوع: {evaluation.groundTruth.typeSplit}</p>
              <p>• المحافظة الأعلى مخاطر متوقعة: {evaluation.groundTruth.expectedTopGov}</p>
            </div>
          </div>

          {/* Phase 1+2: Multi-scenario summary with metrics */}
          <ScenarioSummary scenarios={evaluation.scenarios} />

          {/* Phase 3: Weakness detection */}
          <WeaknessPanel weaknesses={evaluation.weaknesses} />

          {/* Phase 4: Fine-tuning */}
          <FineTuningPanel fineTuning={evaluation.fineTuning} reliability={evaluation.reliability} />

          {/* Model comparison (AdaptiveTrendModel vs TrendSeasonalModel) */}
          <ModelComparisonPanel
            modelComparison={evaluation.fineTuning.modelComparison}
            scenarios={evaluation.scenarios}
          />

          {/* Detailed strategic results (first scenario) */}
          {evaluation.scenarios[0] && !evaluation.scenarios[0].tactical.error && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-slate-700" />
                  <h3 className="font-semibold">تفاصيل التوقع الاستراتيجي — {evaluation.scenarios[0].name}</h3>
                </div>
                <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${accColor(evaluation.scenarios[0].strategic.accuracy)}`}>
                  دقة: {evaluation.scenarios[0].strategic.accuracy}%
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                <MetricCard label="MAE" value={evaluation.scenarios[0].strategic.mae} />
                <MetricCard label="RMSE" value={evaluation.scenarios[0].strategic.rmse} />
                <MetricCard label="MAPE" value={evaluation.scenarios[0].strategic.mape + "%"} />
                <MetricCard label="R²" value={evaluation.scenarios[0].strategic.r2} />
                <MetricCard label="MASE" value={evaluation.scenarios[0].strategic.mase} />
                <MetricCard label="Bias" value={evaluation.scenarios[0].strategic.bias} />
              </div>

              <div style={{ direction: "ltr", height: 240 }} className="mb-4">
                <ResponsiveContainer>
                  <BarChart data={evaluation.scenarios[0].strategic.backtestMonths} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="actual" name="فعلي" fill="#0f172a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="predicted" name="متوقع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detailed tactical results (first scenario) */}
          {evaluation.scenarios[0] && !evaluation.scenarios[0].tactical.error && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-slate-700" />
                <h3 className="font-semibold">تفاصيل التنبؤ التكتيكي — {evaluation.scenarios[0].name}</h3>
              </div>
              <TacticalDetail data={evaluation.scenarios[0].tactical} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TacticalDetail({ data }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <ResultCard label="إجمالي الحوادث" actual={data.totalActual} predicted={data.totalPredicted} accuracy={data.totalAccuracy} />
        <ResultCard label="إجمالي المعتقلين" actual={data.detainedActual} predicted={data.detainedPredicted} accuracy={data.detainedAccuracy} />
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm text-muted-foreground mb-1">المحافظة الأعلى</div>
          <div className="font-medium">{data.topGovCorrect ? "✅ " + data.topGovPredicted : "❌ " + data.topGovPredicted}</div>
          <div className="text-xs text-muted-foreground">فعلي: {data.topGovActual} | تطابق 3: {data.top3Overlap}/{data.top3Max}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm text-muted-foreground mb-1">نوع الحادث</div>
          <div className="font-medium">{data.typeCorrect ? "✅ " + data.typePredicted : "❌ " + data.typePredicted}</div>
          <div className="text-xs text-muted-foreground">فعلي: {data.typeActual}</div>
        </div>
      </div>
      <div style={{ direction: "ltr", height: 200 }}>
        <ResponsiveContainer>
          <BarChart
            data={data.actualByGov.map((g) => ({
              name: g.governorate,
              actual: g.count,
              predicted: +(data.predictedRanking.find((r) => r.governorate === g.governorate)?.rawScore || 0).toFixed(1),
            }))}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="actual" name="فعلي" fill="#0f172a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="predicted" name="متوقع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

function ResultCard({ label, actual, predicted, accuracy }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{predicted}</span>
        <span className="text-xs text-muted-foreground">/ {actual} فعلي</span>
      </div>
      <div className={`text-xs mt-1 ${accuracy >= 80 ? "text-green-600" : accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
        دقة: {accuracy}%
      </div>
    </div>
  );
}