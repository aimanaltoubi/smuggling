import React, { useMemo } from "react";
import { MapPin, CalendarClock, Users, Sparkles, CalendarOff, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { pipelineTacticalPrediction } from "@/lib/pipeline/PipelineBridge";
import IncidentMap from "./IncidentMap";

export default function PredictionSection({ incidents }) {
  const prediction = useMemo(() => {
    if (!incidents.length) return null;
    return pipelineTacticalPrediction(incidents, { horizonDays: 14 });
  }, [incidents]);

  if (!prediction) {
    return <div className="text-muted-foreground" dir="rtl">لا توجد بيانات كافية للتنبؤ</div>;
  }

  const confColor = { عالية: "text-green-600 bg-green-50", متوسطة: "text-amber-600 bg-amber-50", منخفضة: "text-red-600 bg-red-50" };
  const dailyData = prediction.when.dailyBreakdown.map((d) => ({
    day: `${d.date.getDate()}/${d.date.getMonth() + 1}`,
    expected: +d.expected.toFixed(2),
    isPeak: d.label === prediction.when.peakDay.label,
  }));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Predictive map (PRIO-GRID with forecast overlay) */}
      <div>
        <h3 className="font-semibold mb-3">خريطة التنبؤ — PRIO-GRID</h3>
        <IncidentMap incidents={incidents} prediction={prediction} />
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> تهريب</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> تسلل</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block border-2 border-white" /> التنبؤ بالحدث القادم</span>
        </div>
      </div>

      {/* Data endpoint banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex items-center gap-2 text-amber-700 mb-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">تنبؤ تكتيكي ديناميكي بالحدث القادم</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <CalendarOff className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <div className="text-muted-foreground text-xs">آخر سجل في البيانات</div>
              <div className="font-medium">{prediction.dataEndpoint.lastDateLabel}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarClock className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <div className="text-muted-foreground text-xs">فترة التنبؤ ({prediction.forecastWindow.days} يوماً)</div>
              <div className="font-medium">{prediction.forecastWindow.startLabel} ← {prediction.forecastWindow.endLabel}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <div className="text-muted-foreground text-xs">معدل الأنبوب (شهر → يوم)</div>
              <div className="font-medium">{prediction.model.monthlyRate} حادث/شهر — {prediction.model.dailyRate} حادث/يوم | {prediction.model.pipelineModel}</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">{prediction.reasoning.endpoint}</p>
      </div>

      {/* Three prediction cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* WHEN */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <CalendarClock className="w-4 h-4" />
            <span>متى (خلال {prediction.forecastWindow.days} يوماً)</span>
          </div>
          <div className="text-2xl font-bold">{prediction.when.totalExpectedIncidents} <span className="text-sm font-normal text-muted-foreground">حادث متوقع</span></div>
          <div className="text-sm text-muted-foreground mt-1">الذروة: {prediction.when.peakDay.label}</div>
          <div className="text-xs text-muted-foreground mt-1">≈ {prediction.when.peakDay.expected} حادث في يوم الذروة</div>
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
          <div className="text-2xl font-bold">{prediction.howMany.expectedTotalDetained} <span className="text-sm font-normal text-muted-foreground">معتقل متوقع</span></div>
          <div className="text-sm text-muted-foreground mt-1">النوع: {prediction.howMany.predictedType}</div>
          <div className="text-xs text-muted-foreground mt-2">~{prediction.howMany.expectedDetainedPerIncident} لكل حادث</div>
        </div>
      </div>

      {/* Daily breakdown chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">التوقع اليومي للحوادث</h3>
        <p className="text-xs text-muted-foreground mb-3">يوم الأسبوع × الموسم الشهري × الاتجاه الأخير — اليوم الأبرز باللون البرتقالي</p>
        <div style={{ direction: "ltr", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="expected" name="حوادث متوقعة" radius={[3, 3, 0, 0]}>
                {dailyData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isPeak ? "#f59e0b" : "#0f172a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reasoning */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">التفسير</h3>
        <div className="space-y-2 text-sm">
          <ReasonRow label="نقطة نهاية البيانات" text={prediction.reasoning.endpoint} />
          <ReasonRow label="المعدل والاتجاه" text={prediction.reasoning.rate} />
          <ReasonRow label="الموسمية اليومية" text={prediction.reasoning.seasonal} />
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
      <span className="font-medium min-w-[120px] text-muted-foreground">{label}:</span>
      <span>{text}</span>
    </div>
  );
}