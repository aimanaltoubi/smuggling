import React, { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

export default function LocalForecastExplanation({ facts }) {
  const [status, setStatus] = useState({ status: "checking", message: "Checking offline model…" });
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/llm/status", { cache: "no-store" });
        if (!response.ok) throw new Error("Offline model is available only in the Windows app.");
        const result = await response.json();
        if (cancelled) return;
        setStatus(result);
        if (result.status === "checking" || result.status === "starting") {
          timer = window.setTimeout(checkStatus, 1500);
        }
      } catch {
        if (!cancelled) setStatus({ status: "missing-runtime", message: "Offline explanations are available in the Windows app when the optional model is installed." });
      }
    };
    checkStatus();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  const generate = async () => {
    setLoading(true);
    setError("");
    setExplanation("");
    try {
      const response = await fetch("/api/llm/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate an explanation.");
      setExplanation(result.text);
    } catch (cause) {
      setError(cause.message || "Could not generate an explanation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h4 className="font-semibold text-sm">شرح مساعد محلي</h4>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={status.status !== "ready" || loading}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "يُنشئ الشرح محلياً…" : status.status === "starting" ? "جارٍ تحميل النموذج…" : "إنشاء شرح للتوقع"}
        </button>
      </div>
      {status.status !== "ready" && <p className="text-xs text-muted-foreground">{status.message}</p>}
      {explanation && <p className="text-sm leading-7 whitespace-pre-wrap">{explanation}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">شرح نصي مساعد يعمل على هذا الجهاز؛ لا يغيّر الأرقام أو التوقعات ولا يُعد تحققاً من صحتها.</p>
    </section>
  );
}