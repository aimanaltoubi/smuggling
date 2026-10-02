import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

function sevStyle(sev) {
  if (sev === "عالية") return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: AlertCircle, iconColor: "text-red-500" };
  if (sev === "متوسطة") return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" };
  return { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: Info, iconColor: "text-blue-500" };
}

export default function WeaknessPanel({ weaknesses }) {
  if (!weaknesses || weaknesses.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5" dir="rtl">
        <div className="flex items-center gap-2 text-green-700">
          <Info className="w-5 h-5" />
          <h3 className="font-semibold">لا توجد نقاط ضعف حرجة</h3>
        </div>
        <p className="text-sm text-green-600 mt-1">اجتاز النظام جميع اختبارات السيناريوهات</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5" dir="rtl">
      <h3 className="font-semibold mb-1">نقاط الضعف المكتشفة ({weaknesses.length})</h3>
      <p className="text-sm text-muted-foreground mb-3">مناطق فشل محددة بناءً على معايير معروفة (دقة {"<"} 80%، انحياز {"|"} {"|"} {">"} 5، MASE {">"} 1، خطأ شهري {">"} 30%)</p>
      <div className="space-y-2">
        {weaknesses.map((w, idx) => {
          const c = sevStyle(w.severity);
          const Icon = c.icon;
          return (
            <div key={idx} className={`rounded-lg border ${c.border} ${c.bg} p-3 flex items-start gap-3`}>
              <Icon className={`w-5 h-5 ${c.iconColor} flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.text} ${c.bg}`}>{w.severity}</span>
                  <span className="text-xs text-muted-foreground">{w.area}</span>
                  <span className="text-xs text-muted-foreground">— {w.scenario}</span>
                </div>
                <div className="text-sm font-medium mt-1">{w.issue}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{w.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}