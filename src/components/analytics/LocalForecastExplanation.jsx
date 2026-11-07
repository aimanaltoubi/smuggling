import React, { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";

function reportParagraph({ children }) {
  return <p>{React.Children.map(children, child => typeof child === "string"
    ? child.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) => /^\d{4}-\d{2}-\d{2}$/.test(part) ? <bdi key={index} dir="ltr" className="whitespace-nowrap">{part}</bdi> : part)
    : child)}</p>;
}

export default function LocalForecastExplanation({ facts }) {
  const [status, setStatus] = useState({ status: "checking", message: "Checking offline model…" });
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState("report");
  const [method, setMethod] = useState("");
  const requestRef = useRef(null);
  const factsJson = JSON.stringify(facts);

  useEffect(() => {
    requestRef.current?.abort();
    setExplanation("");
    setMethod("");
    setError("");
    setLoading(false);
    return () => requestRef.current?.abort();
  }, [factsJson, format]);

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
        if (!cancelled) setStatus({ status: "missing-runtime", message: "Offline explanations are included in the self-contained Windows installer; they are not available in browser development mode." });
      }
    };
    checkStatus();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  const generate = async () => {
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setExplanation("");
    try {
      const response = await fetch("/api/llm/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts, format }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate an explanation.");
      if (!controller.signal.aborted) {
        setExplanation(result.text);
        setMethod(result.method || "local-model");
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || "Could not generate an explanation.");
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  };

  const downloadReport = () => {
    const provenance = method === "grounded-template" ? "ملاحظة: تحليل مقيد بالحقائق؛ لم يجتز النص التوليدي فحوص الجودة.\n\n" : "";
    const url = URL.createObjectURL(new Blob(["\ufeff", provenance, explanation], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "report" ? "analysis-report.md" : "forecast-explanation.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h4 className="font-semibold text-sm">{format === "report" ? "تقرير تحليلي محلي" : "شرح مساعد محلي"}</h4>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="صيغة التحليل">
          <button type="button" aria-pressed={format === "summary"} disabled={loading} onClick={() => setFormat("summary")} className={`rounded px-3 py-1 text-xs ${format === "summary" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>شرح موجز</button>
          <button type="button" aria-pressed={format === "report"} disabled={loading} onClick={() => setFormat("report")} className={`rounded px-3 py-1 text-xs ${format === "report" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>تقرير تحليلي</button>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={status.status !== "ready" || loading}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "جارٍ التوليد محلياً…" : status.status === "starting" ? "جارٍ تحميل النموذج…" : format === "report" ? "إنشاء تقرير تحليلي" : "إنشاء شرح للتوقع"}
        </button>
        {loading && <button type="button" aria-label="إلغاء التوليد" title="إلغاء التوليد" onClick={() => { requestRef.current?.abort(); setLoading(false); }} className="rounded-md border border-border p-2"><Square size={16} /></button>}
        {explanation && <button type="button" aria-label="تنزيل النص" title="تنزيل النص" onClick={downloadReport} className="rounded-md border border-border p-2"><Download size={16} /></button>}
      </div>
      {status.status !== "ready" && <p className="text-xs text-muted-foreground">{status.message}</p>}
      {explanation && method === "grounded-template" && <p className="text-xs text-amber-800" role="status">تحليل مقيد بالحقائق: لم يجتز النص التوليدي فحوص الجودة، لذلك استُخدم قالب مبني على القيم المقدمة فقط.</p>}
      {explanation && (format === "report" ? <div className="text-sm leading-7 break-words [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pr-5 [&_ol]:list-decimal [&_ol]:pr-5"><ReactMarkdown skipHtml components={{ p: reportParagraph, a: ({ children }) => <span>{children}</span> }}>{explanation}</ReactMarkdown></div> : <p className="text-sm leading-7 whitespace-pre-wrap">{explanation}</p>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">نص مساعد مولد محلياً من البيانات المقدمة فقط؛ قد يخطئ ويجب مراجعته. لا يغيّر الأرقام أو التوقعات ولا يُعد تحققاً من صحتها.</p>
    </section>
  );
}