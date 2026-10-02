import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Database } from "lucide-react";
import { runEDA } from "@/lib/analytics/eda";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function fmtDate(d) {
  if (!d) return "-";
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export default function EdaSection({ incidents }) {
  const eda = runEDA(incidents);
  const span = eda.summary.dateRange;
  const daysSpanned = span.start && span.end ? Math.round((span.end - span.start) / (24 * 3600 * 1000)) + 1 : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Data overview banner */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-700" />
          <h3 className="font-semibold">نظرة عامة على البيانات</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <OverviewItem label="إجمالي السجلات" value={eda.summary.totalIncidents} />
          <OverviewItem label="إجمالي المعتقلين" value={eda.summary.totalDetained} />
          <OverviewItem label="أول سجل" value={fmtDate(span.start)} />
          <OverviewItem label="آخر سجل (نهاية البيانات)" value={fmtDate(span.end)} highlight />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          يمتد التحليل على {daysSpanned} يوماً من البيانات الفعلية — جميع المقاييس التالية محسوبة ديناميكياً من السجلات المحمّلة.
        </p>
      </div>

      {/* Data Quality */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">جودة البيانات</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <QualityItem label="إجمالي السجلات" value={eda.quality.totalRecords} />
          <QualityItem label="معرفات مكررة" value={eda.quality.duplicateIds} warn={eda.quality.duplicateIds > 0} />
          <QualityItem label="إحداثيات غير صالحة" value={eda.quality.invalidCoords} warn={eda.quality.invalidCoords > 0} />
          <QualityItem label="تواريخ غير صالحة" value={eda.quality.invalidDates} warn={eda.quality.invalidDates > 0} />
          <QualityItem label="أعداد سلبية" value={eda.quality.negativeCounts} warn={eda.quality.negativeCounts > 0} />
          <QualityItem label="قوة الموسمية" value={eda.seasonality.seasonalStrength} />
        </div>
        {Object.entries(eda.quality.missing).filter(([, v]) => v > 0).length > 0 && (
          <div className="mt-3 text-sm">
            <div className="text-muted-foreground mb-1">القيم المفقودة:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(eda.quality.missing).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">{k}: {v}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">الحوادث حسب المحافظة</h3>
          <div style={{ direction: "ltr", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={eda.distributions.byGovernorate.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="key" width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f172a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">الحوادث حسب الجنسية</h3>
          <div style={{ direction: "ltr", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={eda.distributions.byEthnicity} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="key" width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#475569" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Seasonality */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">النمط الموسمي (متوسط شهري)</h3>
        <div style={{ direction: "ltr", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={eda.seasonality.months.map((m) => ({ month: m.month, incidents: m.incidents, detained: m.detained }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="incidents" stroke="#dc2626" name="حوادث" strokeWidth={2} />
              <Line type="monotone" dataKey="detained" stroke="#2563eb" name="معتقلون" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Strongest Predictors */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-1">أقوى المتنبئات (نسبة التباين المفسّر)</h3>
        <p className="text-xs text-muted-foreground mb-3">يوضح مدى تأثير كل حقل على عدد المعتقلين (eta²)</p>
        <div className="space-y-3">
          {eda.predictors.map((p) => (
            <div key={p.field}>
              <div className="flex justify-between text-sm mb-1">
                <span>{p.label}</span>
                <span className="text-muted-foreground">{(p.etaSquared * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-slate-800" style={{ width: `${p.etaSquared * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QualityItem({ label, value, warn }) {
  return (
    <div className={`rounded-lg p-3 ${warn ? "bg-red-50" : "bg-muted/50"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function OverviewItem({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-amber-50 border border-amber-200" : "bg-muted/50"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${highlight ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}