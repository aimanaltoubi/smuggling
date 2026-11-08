import React, { useState } from "react";
import { MapPin, CalendarClock, Users, Sparkles, CalendarOff, Activity, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import IncidentMap from "./IncidentMap";
import LocalForecastExplanation from "./LocalForecastExplanation";
import { buildReportEvidence } from "@/lib/analytics/reportEvidence";

const TYPES = [
  { id: "تهريب", accent: "#dc2626", activeClass: "bg-red-600 text-white" },
  { id: "تسلل", accent: "#2563eb", activeClass: "bg-blue-600 text-white" },
];

// Smuggling and infiltration are separate phenomena, so each type gets its own
// prediction run instead of one mixed forecast with a "likely type" label.
// Predictions arrive from Dashboard's worker-backed hook; nothing is computed here.
export default function PredictionSection({ tactical }) {
  const [typeId, setTypeId] = useState(TYPES[0].id);
  const { observationEnd, byType } = tactical;
  const counts = Object.fromEntries(TYPES.map((t) => [t.id, byType[t.id].rows.length]));
  const active = byType[typeId];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">نوع الحوادث:</span>
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button key={t.id} onClick={() => setTypeId(t.id)} className={`px-3 py-1.5 rounded-lg text-sm ${typeId === t.id ? t.activeClass : "bg-muted"}`}>
              {t.id} ({counts[t.id]})
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">تنبؤ مستقل لكل نوع، محسوب من سجلات ذلك النوع فقط</span>
      </div>
      {active.status === "computing" ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ حساب تنبؤ {typeId} من {counts[typeId]} سجلاً… يعمل الحساب في الخلفية ويمكنك متابعة التصفح.
        </div>
      ) : (
        <TypePrediction type={TYPES.find((t) => t.id === typeId)} incidents={active.rows} prediction={active.prediction} observationEnd={observationEnd} />
      )}
    </div>
  );
}

function TypePrediction({ type, incidents, prediction, observationEnd }) {
  if (!prediction) {
    return <div className="text-muted-foreground" dir="rtl">لا توجد بيانات كافية للتنبؤ بحوادث {type.id} (يلزم سجلان على الأقل في ثلاثة أشهر مختلفة)</div>;
  }

  const dailyData = prediction.when.dailyBreakdown.map((d) => ({
    day: `${d.date.getDate()}/${d.date.getMonth() + 1}`,
    expected: +d.expected.toFixed(2),
    isPeak: d.label === prediction.when.peakDay.label,
  }));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Predictive map (PRIO-GRID with forecast overlay) */}
      <div>
        <h3 className="font-semibold mb-3" style={{ color: type.accent }}>خريطة المخاطر والتنبؤ — {type.id}</h3>
        <IncidentMap incidents={incidents} prediction={prediction} observationEnd={observationEnd} />
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: type.accent }} /> حوادث {type.id}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block border-2 border-white" /> التنبؤ بالحدث القادم</span>
        </div>
      </div>

      {/* Data endpoint banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex items-center gap-2 text-amber-700 mb-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">تنبؤ تكتيكي ديناميكي بالحدث القادم — {type.id}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <CalendarOff className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <div className="text-muted-foreground text-xs">آخر سجل في البيانات (جميع الأنواع)</div>
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
              <div className="font-medium">{fmt(prediction.model.monthlyRate)} حادث/شهر — {fmt(prediction.model.dailyRate)} حادث/يوم | {prediction.model.pipelineModel}</div>
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
          <div className="text-2xl font-bold">{fmt(prediction.when.totalExpectedIncidents)} <span className="text-sm font-normal text-muted-foreground">حادث {type.id} متوقع</span></div>
          <div className="text-sm text-muted-foreground mt-1">الذروة: {prediction.when.peakDay.label}</div>
          <div className="text-xs text-muted-foreground mt-1">≈ {fmt(prediction.when.peakDay.expected)} حادث في يوم الذروة</div>
        </div>

        {/* WHERE */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <MapPin className="w-4 h-4" />
            <span>أين</span>
          </div>
          <div className="text-2xl font-bold">{prediction.where.governorate}</div>
          <div className="text-sm text-muted-foreground mt-1">{prediction.where.location || "-"}</div>
          <div className="text-xs text-muted-foreground mt-2">الحصة المتوقعة من حوادث {type.id}: {pct(prediction.where.riskScore)}</div>
        </div>

        {/* HOW MANY */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Users className="w-4 h-4" />
            <span>كم</span>
          </div>
          <div className="text-2xl font-bold">{fmt(prediction.howMany.expectedTotalDetained)} <span className="text-sm font-normal text-muted-foreground">معتقل متوقع</span></div>
          <div className="text-sm text-muted-foreground mt-1">النوع: {type.id}</div>
          <div className="text-xs text-muted-foreground mt-2">~{fmt(prediction.howMany.expectedDetainedPerIncident)} لكل حادث</div>
        </div>
      </div>

      {/* Daily breakdown chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">التوقع اليومي لحوادث {type.id}</h3>
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
                  <Cell key={idx} fill={entry.isPeak ? "#f59e0b" : type.accent} />
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
          <ReasonRow label="نوع الحادث" text={`التنبؤ محسوب من سجلات ${type.id} فقط (${incidents.length} سجلاً)، بمعزل عن النوع الآخر`} />
        </div>
      </div>

      <LocalForecastExplanation facts={{
        observedEvidence: buildReportEvidence(incidents, `${type.id} incidents only`),
        forecast: "tactical event prediction",
        incidentType: type.id,
        observationEnd: prediction.dataEndpoint.lastDateLabel,
        window: { start: prediction.forecastWindow.startLabel, end: prediction.forecastWindow.endLabel, days: prediction.forecastWindow.days },
        expectedIncidentTotal: prediction.when.totalExpectedIncidents,
        recentDailyRate: prediction.model.recentDailyRate,
        dailyIncidentForecast: prediction.when.dailyBreakdown.map(day => ({ date: day.label, expectedIncidents: day.expected })),
        peakDay: { date: prediction.when.peakDay.label, expectedIncidents: prediction.when.peakDay.expected },
        expectedDetaineeTotal: prediction.howMany.expectedTotalDetained,
        expectedDetaineesPerIncident: prediction.howMany.expectedDetainedPerIncident,
        predictedIncidentType: type.id,
        topGovernorate: prediction.where.governorate,
        location: prediction.where.location,
        relativeRiskScore: prediction.where.riskScore,
        governorateRanking: prediction.where.ranking.map(({ governorate, score }) => ({ governorate, relativeShare: score })),
        model: {
          name: prediction.model.pipelineModel,
          selectedCandidates: prediction.model.ensemble?.members?.map(({ id }) => id),
          incidentsRecentWeight: prediction.model.momentumWeight,
          detaineesRecentWeight: prediction.model.detainedMomentumWeight,
        },
        deterministicReasoning: prediction.reasoning,
      }} />

      {/* Governorate risk ranking */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">ترتيب المحافظات حسب حوادث {type.id} المتوقعة</h3>
        <p className="text-xs text-muted-foreground mb-3">النسبة هي حصة المحافظة من حوادث {type.id} المتوقعة خلال {prediction.forecastWindow.days} يوماً، والعدد هو سجلات {type.id} السابقة في المحافظة</p>
        <div className="space-y-2">
          {prediction.where.ranking.map((r, idx) => (
            <div key={r.governorate}>
              <div className="flex justify-between text-sm mb-1">
                <span>{idx + 1}. {r.governorate}</span>
                <span className="text-muted-foreground">{pct(r.score)} | {r.incidents} حادث {type.id}</span>
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

function fmt(value) {
  return Number.isFinite(value) ? String(+value.toFixed(1)) : "-";
}
function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function ReasonRow({ label, text }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="font-medium min-w-[120px] text-muted-foreground">{label}:</span>
      <span>{text}</span>
    </div>
  );
}