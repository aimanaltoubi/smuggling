import React from "react";
import { ShieldCheck, ShieldAlert, ShieldX, CheckCircle, AlertTriangle } from "lucide-react";

function scoreColor(score) {
  if (score === "عالٍ") return { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", icon: ShieldCheck, iconColor: "text-green-600" };
  if (score === "متوسط") return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: ShieldAlert, iconColor: "text-amber-600" };
  return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: ShieldX, iconColor: "text-red-600" };
}

export default function EvaluationVerdict({ reliability }) {
  const c = scoreColor(reliability.score);
  const Icon = c.icon;

  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-5`} dir="rtl">
      <div className="flex items-start gap-3">
        <Icon className={`w-8 h-8 ${c.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-lg">الحكم النهائي: {reliability.score}</h3>
            <div className={`px-3 py-1 rounded-lg ${c.text} font-bold text-xl`}>{reliability.overallScore}%</div>
          </div>
          <p className={`text-sm ${c.text} mt-1`}>{reliability.verdict}</p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            <ScoreItem label="دقة استراتيجية" value={`${reliability.avgStrategic}%`} />
            <ScoreItem label="دقة تكتيكية (حوادث)" value={`${reliability.avgTactical}%`} />
            <ScoreItem label="دقة المعتقلين" value={`${reliability.avgDetained}%`} />
            <ScoreItem label="صحة المحافظة" value={`${reliability.topGovRate}%`} />
            <ScoreItem label="صحة النوع" value={`${reliability.typeRate}%`} />
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-muted-foreground">نقاط ضعف: {reliability.weaknessCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <ShieldX className="w-4 h-4 text-red-500" />
              <span className="text-muted-foreground">حرجة: {reliability.criticalCount}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreItem({ label, value }) {
  return (
    <div className="rounded-lg bg-white/60 border border-border/50 p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}