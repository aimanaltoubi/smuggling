import React from "react";
import { Wrench, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

export default function FineTuningPanel({ fineTuning, reliability }) {
  const { weights, best, tunedAvgAccuracy, tunedDetAvgAccuracy, improvement } = fineTuning;
  const chartData = weights.map((w) => ({
    weight: `w=${w.momentumWeight}`,
    incidents: w.avgAccuracy,
    detained: w.avgDetainedAccuracy,
    isBest: w.momentumWeight === best.momentumWeight,
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-5" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-5 h-5 text-slate-700" />
        <h3 className="font-semibold">الضبط الدقيق (Grid Search)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        البحث الشبكي على وزن الزخم الأخير (momentumWeight) — يبحث عن أفضل توازن بين توقع الأنبوب الموسمي والزخم الأخير
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Grid search chart */}
        <div>
          <h4 className="text-sm font-medium mb-2">دقة كل وزن (متوسط 4 سيناريوهات)</h4>
          <div style={{ direction: "ltr", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="weight" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="incidents" name="حوادث" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isBest ? "#f59e0b" : "#0f172a"} />
                  ))}
                </Bar>
                <Bar dataKey="detained" name="معتقلين" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <ReferenceLine y={reliability.avgTactical} stroke="#94a3b8" strokeDasharray="3 3" label={{ text: "الحالي", fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Before / After */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground mb-1">وزن الزخم الحالي</div>
            <div className="text-lg font-bold">w = 0.4</div>
            <div className="text-sm text-muted-foreground">دقة الحوادث: {reliability.avgTactical}% | المعتقلين: {reliability.avgDetained}%</div>
          </div>
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
            <div className="text-xs text-amber-700 mb-1">أفضل وزن (موصى به)</div>
            <div className="text-lg font-bold text-amber-800">w = {best.momentumWeight}</div>
            <div className="text-sm text-amber-700">دقة الحوادث: {tunedAvgAccuracy}% | المعتقلين: {tunedDetAvgAccuracy}%</div>
          </div>
          <div className={`rounded-lg border p-3 ${improvement > 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {improvement > 0 ? (
                <ArrowUp className="w-4 h-4 text-green-600" />
              ) : (
                <ArrowDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${improvement > 0 ? "text-green-700" : "text-red-700"}`}>
                {improvement > 0 ? "تحسن" : "لا يوجد تحسن"}: {Math.abs(improvement)}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {improvement > 0
                ? `الوزن الموصى به يحسن الدقة التكتيكية بمقدار ${improvement}%`
                : "الوزن الحالي (0.4) هو الأفضل — لا حاجة للضبط"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
        <TrendingUp className="w-3.5 h-3.5 inline ml-1" />
        منهجية الضبط: Grid Search على وزن الزخم [0.0, 0.2, 0.4, 0.6, 0.8]، تقييم كل وزن عبر backtest على 4 سيناريوهات، اختيار الوزن ذو أعلى متوسط دقة
      </div>
    </div>
  );
}