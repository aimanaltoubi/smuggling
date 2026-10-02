import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { CalendarOff, TrendingUp } from "lucide-react";
import { buildMonthlySeries, forecastSeries } from "@/lib/analytics/forecasting";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function fmtDate(d) {
  if (!d) return "-";
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ForecastSection({ incidents }) {
  const [metric, setMetric] = useState("incidents");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    if (typeFilter === "all") return incidents;
    return incidents.filter((i) => i.incident_type === typeFilter);
  }, [incidents, typeFilter]);

  // Data endpoint: last actual incident date in the filtered set
  const dataEndpoint = useMemo(() => {
    const dates = filtered.map((i) => new Date(i.incident_date)).filter((d) => !isNaN(d));
    if (!dates.length) return null;
    return new Date(Math.max(...dates));
  }, [filtered]);

  const { chartData, projection, params, residStd } = useMemo(() => {
    const monthly = buildMonthlySeries(filtered, metric);
    if (monthly.length < 3) return { chartData: [], projection: [], params: {}, residStd: 0 };
    const fc = forecastSeries(monthly, metric, 12, 48);
    // Merge historical + projection into one chart dataset
    const hist = monthly.map((m) => ({ period: m.period, actual: m[metric] }));
    // connect: repeat last historical point as first projection
    const last = hist[hist.length - 1];
    const proj = fc.projection.map((p) => ({ period: p.period, forecast: p.value, lower95: p.lower95, upper95: p.upper95 }));
    const chartData = [...hist, { period: last.period, forecast: last.actual, lower95: last.actual, upper95: last.actual }, ...proj];
    return { chartData, projection: fc.projection, params: fc.params, residStd: fc.residStd };
  }, [filtered, metric]);

  // Yearly aggregation from projection
  const yearlyAgg = useMemo(() => {
    const byYear = {};
    for (const p of projection) {
      const y = p.period.split("-")[0];
      if (!byYear[y]) byYear[y] = { year: y, total: 0, months: 0 };
      byYear[y].total += p.value;
      byYear[y].months += 1;
    }
    return Object.values(byYear);
  }, [projection]);

  const metricLabel = metric === "incidents" ? "عدد الحوادث" : "عدد المعتقلين";

  return (
    <div className="space-y-6" dir="rtl">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          <button onClick={() => setMetric("incidents")} className={`px-3 py-1.5 rounded-lg text-sm ${metric === "incidents" ? "bg-slate-900 text-white" : "bg-muted"}`}>عدد الحوادث</button>
          <button onClick={() => setMetric("detained")} className={`px-3 py-1.5 rounded-lg text-sm ${metric === "detained" ? "bg-slate-900 text-white" : "bg-muted"}`}>عدد المعتقلين</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTypeFilter("all")} className={`px-3 py-1.5 rounded-lg text-sm ${typeFilter === "all" ? "bg-slate-700 text-white" : "bg-muted"}`}>الكل</button>
          <button onClick={() => setTypeFilter("تهريب")} className={`px-3 py-1.5 rounded-lg text-sm ${typeFilter === "تهريب" ? "bg-red-600 text-white" : "bg-muted"}`}>تهريب</button>
          <button onClick={() => setTypeFilter("تسلل")} className={`px-3 py-1.5 rounded-lg text-sm ${typeFilter === "تسلل" ? "bg-blue-600 text-white" : "bg-muted"}`}>تسلل</button>
        </div>
      </div>

      {/* Data endpoint banner */}
      {dataEndpoint && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CalendarOff className="w-4 h-4 text-amber-600" />
              <span className="text-muted-foreground">نهاية البيانات:</span>
              <span className="font-medium text-amber-700">{fmtDate(dataEndpoint)}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span className="text-muted-foreground">يبدأ التوقع من الشهر التالي ويمتد 48 شهراً (4 سنوات) للأمام</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            النموذج يبني السلسلة الشهرية من السجلات الفعلية حتى {fmtDate(dataEndpoint)} ثم يطبّق تنعيم هولت-وينترز الموسمي للتوقع.
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">التوقع الموسمي - 4 سنوات قادمة (شهري)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {metricLabel} | الخط الصلب: تاريخي | الخط المتقطع: توقع | خطوط منقطة: حدود الثقة 95%
        </p>
        <div style={{ direction: "ltr", height: 360 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={5} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="actual" stroke="#0f172a" name="تاريخي" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="forecast" stroke="#f59e0b" name="توقع" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
              <Line type="monotone" dataKey="upper95" stroke="#f59e0b" name="حد أعلى 95%" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
              <Line type="monotone" dataKey="lower95" stroke="#f59e0b" name="حد أدنى 95%" strokeWidth={1} strokeDasharray="2 4" dot={false} opacity={0.4} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Yearly aggregation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">الإجمالي السنوي المتوقع</h3>
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
          معاملات النموذج: α={params?.alpha}, β={params?.beta}, γ={params?.gamma} | الانحراف المتبقي: {residStd}
        </div>
      </div>

      {/* Monthly projection table */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">التوقع الشهري التفصيلي</h3>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-right">
                <th className="py-2 px-2">الشهر</th>
                <th className="py-2 px-2">{metricLabel}</th>
                <th className="py-2 px-2">حد أدنى 95%</th>
                <th className="py-2 px-2">حد أعلى 95%</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((p) => (
                <tr key={p.period} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{p.period}</td>
                  <td className="py-1.5 px-2 font-medium">{p.value.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{p.lower95.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{p.upper95.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}