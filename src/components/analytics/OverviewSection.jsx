import React from "react";
import { Users, AlertTriangle, CalendarRange, MapPin } from "lucide-react";

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function OverviewSection({ incidents, prediction }) {
  const summary = {
    total: incidents.length,
    detained: incidents.reduce((a, b) => a + (b.detained_count || 0), 0),
    byType: incidents.reduce((acc, i) => { acc[i.incident_type] = (acc[i.incident_type] || 0) + 1; return acc; }, {}),
  };
  const dates = incidents.map((i) => new Date(i.incident_date)).filter((d) => !isNaN(d));
  const start = dates.length ? new Date(Math.min(...dates)).toLocaleDateString("ar") : "-";
  const end = dates.length ? new Date(Math.max(...dates)).toLocaleDateString("ar") : "-";
  const topGov = Object.entries(incidents.reduce((acc, i) => { acc[i.governorate] = (acc[i.governorate] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={AlertTriangle} label="إجمالي الحوادث" value={summary.total} />
        <StatCard icon={Users} label="إجمالي المعتقلين" value={summary.detained} />
        <StatCard icon={CalendarRange} label="النطاق الزمني" value={`${dates.length} شهر`} sub={`${start} ← ${end}`} />
        <StatCard icon={MapPin} label="أعلى محافظة" value={topGov ? topGov[0] : "-"} sub={topGov ? `${topGov[1]} حادث` : ""} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">التوزيع حسب النوع</h3>
          <div className="space-y-3">
            {Object.entries(summary.byType).map(([type, count]) => {
              const pct = ((count / summary.total) * 100).toFixed(1);
              return (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{type}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={type === "تهريب" ? "h-full bg-red-600" : "h-full bg-blue-600"} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">أعلى 5 محافظات</h3>
          <div className="space-y-2">
            {Object.entries(incidents.reduce((acc, i) => { acc[i.governorate] = (acc[i.governorate] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([gov, count]) => (
              <div key={gov} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                <span>{gov}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}