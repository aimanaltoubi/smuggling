import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalendarOff } from "lucide-react";
import { pipelineStrategicForecast } from "@/lib/pipeline/PipelineBridge";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function fmtDate(d) {
  if (!d) return "-";
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

// One forecast chart for a given set of incidents (already filtered by type).
// Forecasts come from the MLOps pipeline (ViEWS baselines) — the same engine
// that powers every prediction in the app.
export default function TypeForecast({ incidents, metric, title, accent = "#0f172a" }) {
  const { chartData, projection, params, residStd, lastDate } = useMemo(() => {
    if (incidents.length < 3) return { chartData: [], projection: [], params: {}, residStd: 0, lastDate: null };
    const fc = pipelineStrategicForecast(incidents, { target: metric, level: "governorate", horizon: 48 });
    const hist = fc.historical.map((m) => ({ period: m.period, actual: m[metric] }));
    if (!hist.length) return { chartData: [], projection: [], params: fc.params, residStd: fc.residStd, lastDate: null };
    const last = hist[hist.length - 1];
    const proj = fc.projection.map((p) => ({ period: p.period, forecast: p.value, lower95: p.lower95, upper95: p.upper95 }));
    const chartData = [...hist, { period: last.period, forecast: last.actual, lower95: last.actual, upper95: last.actual }, ...proj];
    return { chartData, projection: fc.projection, params: fc.params, residStd: fc.residStd, lastDate: fc.historical[fc.historical.length - 1].date };
  }, [incidents, metric]);

  const metricLabel = metric === "incidents" ? "عدد الحوادث" : "عدد المعتقلين";

  const yearlyAgg = useMemo(() => {
    const byYear = {};
    for (const p of projection) {
      const y = p.period.split("-")[0];
      if (!byYear[y]) byYear[y] = { year: y, total: 0 };
      byYear[y].total += p.value;
    }
    return Object.values(byYear);
  }, [projection]);

  if (!chartData.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">لا توجد بيانات كافية للتوقع (أقل من 3 أشهر)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold" style={{ color: accent }}>{title}</h3>
          {lastDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarOff className="w-3.5 h-3.5" /> نهاية البيانات: {fmtDate(lastDate)}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {metricLabel} | صلب: تاريخي | متقطع: توقع أنبوب MLOps | منقطة: حدود الثقة 80%
        </p>
        <div style={{ direction: "ltr", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={5} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="actual" stroke={accent} name="تاريخي" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="forecast" stroke="#f59e0b" name="توقع" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
              <Line type="monotone" dataKey="upper95" stroke="#f59e0b" name="حد أعلى" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
              <Line type="monotone" dataKey="lower95" stroke="#f59e0b" name="حد أدنى" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="font-semibold mb-3">الإجمالي السنوي المتوقع — {title}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {yearlyAgg.map((y) => (
            <div key={y.year} className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xs text-muted-foreground">{y.year}</div>
              <div className="text-xl font-bold">{Math.round(y.total)}</div>
              <div className="text-xs text-muted-foreground">{metricLabel}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          النموذج: {params?.model} ({params?.family}) | مستوى: {params?.level} | RMSE التحقق: {residStd}
        </div>
      </div>
    </div>
  );
}