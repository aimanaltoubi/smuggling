import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, Send, Trash2, X } from "lucide-react";
import { buildReportEvidence } from "@/lib/analytics/reportEvidence";
import { answerSystemQuestion } from "@/lib/analytics/systemChat";

function dateText(children) {
  return React.Children.map(children, child => typeof child === "string"
    ? child.split(/(\d{4}-\d{2}(?:-\d{2})?)/).map((part, index) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(part) ? <bdi key={index} dir="ltr" className="whitespace-nowrap">{part}</bdi> : part)
    : child);
}

export default function FloatingSystemChat({ incidents, prediction, activeTab }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [forecasts, setForecasts] = useState({});
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const historyRef = useRef(null);
  const evidence = useMemo(() => buildReportEvidence(incidents || [], "all loaded records"), [incidents]);

  useEffect(() => {
    const receive = event => {
      const facts = event.detail;
      const key = `${facts.forecast}|${facts.target}|${facts.incidentType || "all"}`;
      setForecasts(current => ({ ...current, [key]: facts }));
    };
    window.addEventListener("system-forecast-facts", receive);
    return () => window.removeEventListener("system-forecast-facts", receive);
  }, []);
  useEffect(() => { setMessages([]); setForecasts({}); }, [incidents]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleEscape = event => {
      if (event.key !== "Escape") return;
      setOpen(false);
      launcherRef.current?.focus();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);
  useEffect(() => { if (open && historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, [messages, open]);

  const close = () => { setOpen(false); launcherRef.current?.focus(); };
  const ask = event => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) return;
    const detachedTarget = /معتقل|detain/i.test(prompt);
    const type = prompt.includes("تهريب") && !prompt.includes("تسلل") ? "تهريب" : prompt.includes("تسلل") && !prompt.includes("تهريب") ? "تسلل" : null;
    const available = Object.values(forecasts).filter(facts => /معتقل|detain/i.test(facts.target || "") === detachedTarget && (!type || facts.incidentType?.includes(type)));
    const asksAnnual = /(?:ال|لل)سنة القادم(?:ة)?|(?:ال|لل)سنة المقبل(?:ة)?|(?:ال|لل)عام القادم|(?:ال|لل)عام المقبل|الاثني عشر شهرا|الاثني عشر شهراً|12 شهرا|12 شهراً|next year|year ahead|next 12 months/i.test(prompt);
    const tactical = prediction ? {
      forecast: "tactical", target: "عدد الحوادث", observedEvidence: evidence,
      window: { start: prediction.forecastWindow.startLabel, end: prediction.forecastWindow.endLabel },
      expectedIncidentTotal: prediction.when.totalExpectedIncidents,
      dailyIncidentForecast: prediction.when.dailyBreakdown.map(day => ({ date: day.label, expectedIncidents: day.expected })),
      recentDailyRate: prediction.model.recentDailyRate,
    } : null;
    const monthlyForecast = available.find(facts => facts.forecast === "monthly strategic");
    const forecastFacts = asksAnnual && monthlyForecast
      ? monthlyForecast
      : activeTab === "prediction" || /تكتيكي|قادم|tactical|prediction/i.test(prompt) ? tactical : available[0] || tactical;
    const selectedRecords = type ? (incidents || []).filter(incident => incident.incident_type === type) : incidents || [];
    const selectedEvidence = type ? buildReportEvidence(selectedRecords, type) : evidence;
    const answer = answerSystemQuestion(prompt, { evidence: selectedEvidence, forecastFacts, records: selectedRecords });
    setMessages(current => [...current, { role: "user", text: prompt }, { role: "assistant", ...answer }].slice(-40));
    setQuestion("");
  };

  return <>
    {open && <aside role="dialog" aria-label="مساعد النظام" dir="rtl" className="fixed bottom-20 left-3 z-[1500] flex h-[min(620px,calc(100dvh-104px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div><h3 className="text-sm font-semibold">مساعد النظام</h3><p className="text-xs text-muted-foreground">إجابات من حسابات الجلسة ودليل النظام</p></div>
        <div className="flex gap-1"><button type="button" title="مسح المحادثة" aria-label="مسح المحادثة" className="rounded p-2 hover:bg-muted" onClick={() => setMessages([])}><Trash2 size={16} /></button><button type="button" title="إغلاق المساعد" aria-label="إغلاق المساعد" className="rounded p-2 hover:bg-muted" onClick={close}><X size={18} /></button></div>
      </header>
      <div ref={historyRef} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && <p className="text-sm leading-7 text-muted-foreground">ما السؤال الذي تريد طرحه عن البيانات أو التوقعات أو النظام؟</p>}
        {messages.map((message, index) => <div key={index} data-chat-role={message.role} className={`break-words text-sm leading-7 ${message.role === "user" ? "mr-8 rounded-md bg-muted px-3 py-2" : "border-b border-border pb-3"}`}>
          {message.role === "user" ? <p className="whitespace-pre-wrap">{message.text}</p> : <><ReactMarkdown skipHtml components={{ p: ({ children }) => <p>{dateText(children)}</p>, strong: ({ children }) => <strong>{dateText(children)}</strong>, a: ({ children }) => <span>{children}</span>, img: () => null }}>{message.text}</ReactMarkdown><p className="mt-2 text-xs text-muted-foreground">المصدر: {message.source}</p></>}
        </div>)}
      </div>
      <form onSubmit={ask} className="flex shrink-0 items-end gap-2 border-t border-border bg-background p-3">
        <textarea ref={inputRef} aria-label="سؤالك للمساعد" placeholder="اكتب سؤالك" value={question} maxLength={1500} rows={2} className="min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm" onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(event); } }} />
        <button type="submit" title="إرسال السؤال" aria-label="إرسال السؤال" disabled={!question.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-700 text-white disabled:opacity-40"><Send size={17} /></button>
      </form>
    </aside>}
    <button ref={launcherRef} type="button" title={open ? "إغلاق المساعد" : "فتح مساعد النظام"} aria-label={open ? "إغلاق المساعد" : "فتح مساعد النظام"} aria-expanded={open} onClick={() => open ? close() : setOpen(true)} className="fixed bottom-4 left-4 z-[1500] grid h-12 w-12 place-items-center rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800"><MessageCircle size={22} /></button>
  </>;
}