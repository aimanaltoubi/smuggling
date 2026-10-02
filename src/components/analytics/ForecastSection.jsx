import React, { useMemo, useState } from "react";
import TypeForecast from "./TypeForecast";

export default function ForecastSection({ incidents }) {
  const [metric, setMetric] = useState("incidents");
  const [view, setView] = useState("both"); // "both" | "single"
  const [typeFilter, setTypeFilter] = useState("all");

  const smuggling = useMemo(() => incidents.filter((i) => i.incident_type === "تهريب"), [incidents]);
  const infiltration = useMemo(() => incidents.filter((i) => i.incident_type === "تسلل"), [incidents]);

  const singleSet = useMemo(() => {
    if (typeFilter === "all") return incidents;
    return incidents.filter((i) => i.incident_type === typeFilter);
  }, [incidents, typeFilter]);

  const btn = (active, extra = "") =>
    `px-3 py-1.5 rounded-lg text-sm ${active ? "bg-slate-900 text-white" : "bg-muted"} ${extra}`;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          <button onClick={() => setMetric("incidents")} className={btn(metric === "incidents")}>عدد الحوادث</button>
          <button onClick={() => setMetric("detained")} className={btn(metric === "detained")}>عدد المعتقلين</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("both")} className={btn(view === "both")}>النوعين معاً</button>
          <button onClick={() => setView("single")} className={btn(view === "single")}>نوع واحد</button>
        </div>
        {view === "single" && (
          <div className="flex gap-2">
            <button onClick={() => setTypeFilter("all")} className={btn(typeFilter === "all")}>الكل</button>
            <button onClick={() => setTypeFilter("تهريب")} className={btn(typeFilter === "تهريب", typeFilter === "تهريب" ? "bg-red-600" : "")}>تهريب</button>
            <button onClick={() => setTypeFilter("تسلل")} className={btn(typeFilter === "تسلل", typeFilter === "تسلل" ? "bg-blue-600" : "")}>تسلل</button>
          </div>
        )}
      </div>

      {view === "both" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TypeForecast incidents={smuggling} metric={metric} title="تهريب" accent="#dc2626" />
          <TypeForecast incidents={infiltration} metric={metric} title="تسلل" accent="#2563eb" />
        </div>
      ) : (
        <TypeForecast
          incidents={singleSet}
          metric={metric}
          title={typeFilter === "all" ? "جميع الحوادث" : typeFilter}
          accent={typeFilter === "تهريب" ? "#dc2626" : typeFilter === "تسلل" ? "#2563eb" : "#0f172a"}
        />
      )}
    </div>
  );
}