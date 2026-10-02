import React, { useMemo } from "react";
import { MapPin, CalendarClock, Users, Sparkles } from "lucide-react";
import { predictNextEvent } from "@/lib/analytics/prediction";

export default function PredictionSection({ incidents }) {
  const prediction = useMemo(() => {
    if (!incidents.length) return null;
    return predictNextEvent(incidents);
  }, [incidents]);

  if (!prediction) {
    return <div className="text-muted-foreground" dir="rtl">لا توجد بيانات كافية للتنبؤ</div>;
  }

  const confColor = { "عالية": "text-green-600 bg-green-50", "متوسطة": "text-amber-600 bg-amber-50", "منخفضة": "text-red-600 bg-red-50" };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex items-center gap-2 text-amber-700 mb-1">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">تنبؤ تحليلي بالحدث القادم</span>
        </div>
        <p className="text-xs text-muted-foreground">يجمع النموذج بين التوقع الموسمي (متى وكم) ونموذج المخاطر المكانية (أين)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* WHEN */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <CalendarClock className="w-4 h-4" />
            <span>متى</span>
          </div>
          <div className="text-2xl font-bold">{prediction.when.period}</div>
          <div className="text-sm text-muted-foreground mt-1">حوادث متوقعة: {prediction.when.expectedIncidents}</div>
          <div className={`inline-block px-2 py-0.5 rounded text-xs mt-2 ${confColor[prediction.when.confidence]}`}>
            ثقة: {prediction.when.confidence}
          </div>
        </div>

        {/* WHERE */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <MapPin className="w-4 h-4" />
            <span>أين</span>
          </div>
          <div className="text-2xl font-bold">{prediction.where.governorate}</div>
          <div className="text-sm text-muted-foreground mt-1">{prediction.where.location || "-"}</div>
          <div className="text-xs text-muted-foreground mt-2">درجة المخاطر: {prediction.where.riskScore}</div>
        </div>

        {/* HOW MANY */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Users className="w-4 h-4" />
            <span>كم</span>
          </div>
          <div className="text-2xl font-bold">{prediction.howMany.expectedTotalDetained}</div>
          <div className="text-sm text-muted-foreground mt-1">معتقل متوقع (إجمالي)</div>
          <div className="text-xs text-muted-foreground mt-2">
            النوع: {prediction.howMany.predictedType} | ~{prediction.howMany.expectedDetainedPerIncident} لكل حادث
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">التفسير</h3>
        <div className="space-y-2 text-sm">
          <ReasonRow label="الموسمية" text={prediction.reasoning.seasonal} />
          <ReasonRow label="المخاطر المكانية" text={prediction.reasoning.spatial} />
          <ReasonRow label="نوع الحادث" text={prediction.reasoning.typeReason} />
        </div>
      </div>

      {/* Governorate risk ranking */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">ترتيب المخاطر حسب المحافظة</h3>
        <div className="space-y-2">
          {prediction.where.ranking.map((r, idx) => (
            <div key={r.governorate}>
              <div className="flex justify-between text-sm mb-1">
                <span>{idx + 1}. {r.governorate}</span>
                <span className="text-muted-foreground">{(r.score * 100).toFixed(1)}% | {r.incidents} حادث</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={idx === 0 ? "h-full bg-amber-500" : "h-full bg-slate-400"} style={{ width: `${r.score * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReasonRow({ label, text }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="font-medium min-w-[100px] text-muted-foreground">{label}:</span>
      <span>{text}</span>
    </div>
  );
}