import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, BarChart3, TrendingUp, Target, Upload, ClipboardCheck, Workflow } from "lucide-react";
import { useTacticalPrediction } from "@/lib/pipeline/tacticalClient";
import OverviewSection from "@/components/analytics/OverviewSection";
import EdaSection from "@/components/analytics/EdaSection";
import ForecastSection from "@/components/analytics/ForecastSection";
import PredictionSection from "@/components/analytics/PredictionSection";
import DataUploadSection from "@/components/analytics/DataUploadSection";
import EvaluationSection from "@/components/analytics/EvaluationSection";
import SystemGuideSection from "@/components/analytics/SystemGuideSection";
import FloatingSystemChat from "@/components/analytics/FloatingSystemChat";
import { preloadBasemap } from "@/components/analytics/OfflineBasemap";

const TABS = [
  { id: "overview", label: "نظرة عامة", icon: BarChart3 },
  { id: "eda", label: "تحليل البيانات", icon: BarChart3 },
  { id: "forecast", label: "التوقع الموسمي", icon: TrendingUp },
  { id: "prediction", label: "التنبؤ بالحدث القادم", icon: Target },
  { id: "upload", label: "رفع البيانات", icon: Upload },
  { id: "evaluation", label: "تقييم النموذج", icon: ClipboardCheck },
  { id: "system", label: "النماذج وآلية العمل", icon: Workflow },
];

export default function Dashboard() {
  const [incidents, setIncidents] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");

  useEffect(() => {
    const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 1000));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = schedule(preloadBasemap);
    return () => cancel(handle);
  }, []);

  // Smuggling and infiltration are predicted separately; no mixed-type tactical forecast exists.
  const typeRows = useMemo(() => {
    if (!incidents || !incidents.length) return { observationEnd: undefined, تهريب: [], تسلل: [] };
    let end = -Infinity;
    for (const i of incidents) { const t = Date.parse(i.incident_date); if (t > end) end = t; }
    return {
      observationEnd: Number.isFinite(end) ? new Date(end).toISOString() : undefined,
      تهريب: incidents.filter((i) => i.incident_type === "تهريب"),
      تسلل: incidents.filter((i) => i.incident_type === "تسلل"),
    };
  }, [incidents]);
  const smuggling = useTacticalPrediction(typeRows.تهريب, { horizonDays: 14, observationEnd: typeRows.observationEnd });
  const infiltration = useTacticalPrediction(typeRows.تسلل, { horizonDays: 14, observationEnd: typeRows.observationEnd });
  const tactical = {
    observationEnd: typeRows.observationEnd,
    byType: { تهريب: { rows: typeRows.تهريب, ...smuggling }, تسلل: { rows: typeRows.تسلل, ...infiltration } },
  };
  const predictions = { تهريب: smuggling.prediction, تسلل: infiltration.prediction };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-slate-800" />
            <div>
              <h1 className="font-bold text-lg">نظام الاستشراف والتنبؤ باحداث التهريب والتسلل</h1>
              <p className="text-xs text-muted-foreground">التهريب والتسلل | تحليل بيانات وتوقع موسمي لـ 4 سنوات</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{incidents ? `${incidents.length} سجل` : "لا توجد بيانات محملة"}</div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  disabled={!incidents && !["upload", "system"].includes(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === t.id ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "upload" && <DataUploadSection onImported={setIncidents} onGoToEDA={() => setActiveTab("eda")} />}
        {incidents && activeTab === "overview" && <OverviewSection incidents={incidents} />}
        {incidents && activeTab === "eda" && <EdaSection incidents={incidents} />}
        {incidents && activeTab === "forecast" && <ForecastSection incidents={incidents} />}
        {incidents && activeTab === "prediction" && <PredictionSection tactical={tactical} />}
        {incidents && activeTab === "evaluation" && <EvaluationSection incidents={incidents} />}
        {activeTab === "system" && <SystemGuideSection />}
      </main>
      <FloatingSystemChat incidents={incidents} predictions={predictions} activeTab={activeTab} />
    </div>
  );
}