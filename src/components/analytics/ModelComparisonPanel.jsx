import React from "react";
import { GitCompare, ArrowUp, ArrowDown, Minus } from "lucide-react";

export default function ModelComparisonPanel({ modelComparison, scenarios }) {
  if (!modelComparison) return null;
  const adaptive = modelComparison["AdaptiveTrendModel"];
  const trend = modelComparison["TrendSeasonalModel"];
  const incDiff = +(adaptive.avgAccuracy - trend.avgAccuracy).toFixed(1);
  const detDiff = +(adaptive.avgDetainedAccuracy - trend.avgDetainedAccuracy).toFixed(1);

  // Per-scenario comparison
  const scenarioRows = scenarios.map((s) => {
    const newAcc = s.tactical?.totalAccuracy || 0;
    const oldAcc = s.tacticalOld?.totalAccuracy || 0;
    const newDet = s.tactical?.detainedAccuracy || 0;
    const oldDet = s.tacticalOld?.detainedAccuracy || 0;
    return {
      name: s.name,
      newAcc, oldAcc, accDiff: +(newAcc - oldAcc).toFixed(1),
      newDet, oldDet, detDiff: +(newDet - oldDet).toFixed(1),
      newGov: s.tactical?.topGovCorrect, oldGov: s.tacticalOld?.topGovCorrect,
    };
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <GitCompare className="w-5 h-5 text-slate-700" />
        <h3 className="font-semibold">مقارنة النماذج (قبل/بعد التحسين)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        AdaptiveTrendModel (STL + Holt's damped trend, φ=0.85) مقابل TrendSeasonalModel (النموذج السابق)
        — مرجع: Hyndman FPP3 Ch6/Ch8، Gardner-McKenzie 1985
      </p>

      {/* Overall comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ModelCard
          name="AdaptiveTrendModel (محسّن)"
          subtitle="STL + Holt's damped trend"
          incAcc={adaptive.avgAccuracy}
          detAcc={adaptive.avgDetainedAccuracy}
          isImproved
        />
        <ModelCard
          name="TrendSeasonalModel (سابق)"
          subtitle="موسمية × عامل اتجاه مثبت"
          incAcc={trend.avgAccuracy}
          detAcc={trend.avgDetainedAccuracy}
        />
      </div>

      {/* Delta summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <DeltaCard label="فرق دقة الحوادث" diff={incDiff} />
        <DeltaCard label="فرق دقة المعتقلين" diff={detDiff} />
      </div>

      {/* Per-scenario table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-right py-2 px-3 font-medium">السيناريو</th>
              <th className="text-right py-2 px-3 font-medium">حوادث (محسّن)</th>
              <th className="text-right py-2 px-3 font-medium">حوادث (سابق)</th>
              <th className="text-right py-2 px-3 font-medium">الفرق</th>
              <th className="text-right py-2 px-3 font-medium">معتقلين (محسّن)</th>
              <th className="text-right py-2 px-3 font-medium">معتقلين (سابق)</th>
              <th className="text-right py-2 px-3 font-medium">الفرق</th>
              <th className="text-right py-2 px-3 font-medium">المحافظة (محسّن)</th>
              <th className="text-right py-2 px-3 font-medium">المحافظة (سابق)</th>
            </tr>
          </thead>
          <tbody>
            {scenarioRows.map((r, idx) => (
              <tr key={idx} className="border-b border-border/50">
                <td className="py-2 px-3 font-medium">{r.name}</td>
                <td className="py-2 px-3 font-bold text-green-700">{r.newAcc}%</td>
                <td className="py-2 px-3 text-muted-foreground">{r.oldAcc}%</td>
                <td className={`py-2 px-3 font-medium ${r.accDiff > 0 ? "text-green-600" : r.accDiff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {r.accDiff > 0 ? "+" : ""}{r.accDiff}%
                </td>
                <td className="py-2 px-3 font-bold text-green-700">{r.newDet}%</td>
                <td className="py-2 px-3 text-muted-foreground">{r.oldDet}%</td>
                <td className={`py-2 px-3 font-medium ${r.detDiff > 0 ? "text-green-600" : r.detDiff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {r.detDiff > 0 ? "+" : ""}{r.detDiff}%
                </td>
                <td className="py-2 px-3">{r.newGov ? "✅" : "❌"}</td>
                <td className="py-2 px-3">{r.oldGov ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
        المراجع: Hyndman & Athanasopoulos (2021) FPP3 Ch6 (STL), Ch8 (Holt's damped trend)؛
        Gardner & McKenzie (1985) — معلمة التخميد φ؛
        Hegre et al. (2021) ViEWS2020 — التجميع العكسي-RMSE
      </div>
    </div>
  );
}

function ModelCard({ name, subtitle, incAcc, detAcc, isImproved }) {
  return (
    <div className={`rounded-lg border p-4 ${isImproved ? "border-green-300 bg-green-50" : "border-border bg-muted/30"}`}>
      <div className="font-semibold">{name}</div>
      <div className="text-xs text-muted-foreground mb-2">{subtitle}</div>
      <div className="flex gap-4">
        <div>
          <div className="text-xs text-muted-foreground">دقة الحوادث</div>
          <div className="text-xl font-bold">{incAcc}%</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">دقة المعتقلين</div>
          <div className="text-xl font-bold">{detAcc}%</div>
        </div>
      </div>
    </div>
  );
}

function DeltaCard({ label, diff }) {
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const color = diff > 0 ? "text-green-600 bg-green-50 border-green-200" : diff < 0 ? "text-red-600 bg-red-50 border-red-200" : "text-muted-foreground bg-muted/30 border-border";
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-2 ${color}`}>
      <Icon className="w-5 h-5" />
      <div>
        <div className="text-xs">{label}</div>
        <div className="text-lg font-bold">{diff > 0 ? "+" : ""}{diff}%</div>
      </div>
    </div>
  );
}