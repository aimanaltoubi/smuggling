import React from "react";
import { CheckCircle, XCircle } from "lucide-react";

function accColor(pct) {
  if (pct >= 80) return "text-green-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function ScenarioSummary({ scenarios }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5" dir="rtl">
      <h3 className="font-semibold mb-3">جدول السيناريوهات (4 أنماط بيانات)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-right py-2 px-3 font-medium">السيناريو</th>
              <th className="text-right py-2 px-3 font-medium">النمط</th>
              <th className="text-right py-2 px-3 font-medium">استراتيجي</th>
              <th className="text-right py-2 px-3 font-medium">تكتيكي (حوادث)</th>
              <th className="text-right py-2 px-3 font-medium">تكتيكي (معتقلين)</th>
              <th className="text-right py-2 px-3 font-medium">المحافظة</th>
              <th className="text-right py-2 px-3 font-medium">النوع</th>
              <th className="text-right py-2 px-3 font-medium">R²</th>
              <th className="text-right py-2 px-3 font-medium">MASE</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-2 px-3 font-medium">{s.name}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{s.profile}</td>
                <td className={`py-2 px-3 font-bold ${accColor(s.strategic.accuracy)}`}>{s.strategic.accuracy}%</td>
                <td className={`py-2 px-3 font-bold ${accColor(s.tactical.totalAccuracy)}`}>{s.tactical.error ? "—" : `${s.tactical.totalAccuracy}%`}</td>
                <td className={`py-2 px-3 font-bold ${accColor(s.tactical.detainedAccuracy)}`}>{s.tactical.error ? "—" : `${s.tactical.detainedAccuracy}%`}</td>
                <td className="py-2 px-3">
                  {s.tactical.error ? "—" : s.tactical.topGovCorrect ? (
                    <CheckCircle className="w-4 h-4 text-green-600 inline" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 inline" />
                  )}
                </td>
                <td className="py-2 px-3">
                  {s.tactical.error ? "—" : s.tactical.typeCorrect ? (
                    <CheckCircle className="w-4 h-4 text-green-600 inline" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 inline" />
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-xs">{s.strategic.r2}</td>
                <td className="py-2 px-3 font-mono text-xs">{s.strategic.mase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span>MAE = متوسط الخطأ المطلق | MAPE = نسبة الخطأ | RMSE = جذر متوسط مربع الخطأ</span>
        <span>R² = معامل التحديد | MASE = خطأ مقيس ({"<"} 1 = أفضل من الساذج)</span>
      </div>
    </div>
  );
}