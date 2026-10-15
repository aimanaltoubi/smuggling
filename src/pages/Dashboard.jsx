import React, { useMemo, useState } from "react";
import { ShieldCheck, BarChart3, TrendingUp, Target, Upload, ClipboardCheck } from "lucide-react";
import { pipelineTacticalPrediction } from "@/lib/pipeline/PipelineBridge";
import OverviewSection from "@/components/analytics/OverviewSection";
import EdaSection from "@/components/analytics/EdaSection";
import ForecastSection from "@/components/analytics/ForecastSection";
import PredictionSection from "@/components/analytics/PredictionSection";
import DataUploadSection from "@/components/analytics/DataUploadSection";
import EvaluationSection from "@/components/analytics/EvaluationSection";

const TABS = [
  { id: "overview", label: "نظرة عامة", icon: BarChart3 },
  { id: "eda", label: "تحليل البيانات", icon: BarChart3 },
  { id: "forecast", label: "التوقع الموسمي", icon: TrendingUp },
  { id: "prediction", label: "التنبؤ بالحدث القادم", icon: Target },
  { id: "upload", label: "رفع البيانات", icon: Upload },
  { id: "evaluation", label: "تقييم النموذج", icon: ClipboardCheck },
];

export default function Dashboard() {
  const [incidents, setIncidents] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");

  const prediction = useMemo(
    () => (incidents && incidents.length ? pipelineTacticalPrediction(incidents, { horizonDays: 14 }) : null),
    [incidents]
  );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-slate-800" />
            <div>
              <h1 className="font-bold text-lg">نظام التوقع والتنبؤ - حدود سلطنة عمان</h1>
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
                  disabled={!incidents && t.id !== "upload"}
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
        {incidents && activeTab === "overview" && <OverviewSection incidents={incidents} prediction={prediction} />}
        {incidents && activeTab === "eda" && <EdaSection incidents={incidents} />}
        {incidents && activeTab === "forecast" && <ForecastSection incidents={incidents} />}
        {incidents && activeTab === "prediction" && <PredictionSection incidents={incidents} />}
        {incidents && activeTab === "evaluation" && <EvaluationSection incidents={incidents} />}
      </main>
    </div>
  );
}