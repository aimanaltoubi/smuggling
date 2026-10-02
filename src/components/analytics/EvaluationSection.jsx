import React, { useState } from "react";
import { ClipboardCheck, Play, Loader2, CheckCircle, XCircle, TrendingUp, MapPin, Users, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { runFullEvaluation } from "@/lib/evaluation/evaluator";

function accuracyColor(pct) {
  if (pct >= 80) return "text-green-600 bg-green-50 border-green-200";
  if (pct >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function accuracyLabel(pct) {
  if (pct >= 80) return "دقيق";
  if (pct >= 60) return "مقبول";
  return "ضعيف";
}

export default function EvaluationSection() {
  const [evaluation, setEvaluation] = useState(null);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    setEvaluation(null);
    setTimeout(() => {
      try {
        const result = runFullEvaluation();
        setEvaluation(result);
      } catch (e) {
        console.error(e);
      }
      setRunning(false);
    }, 100);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + Run button */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="font-semibold">تقييم دقة النموذج</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                توليد بيانات اصطناعية بأنماط معروفة، ثم اختبار الأنبوب على بيانات محجوبة لقياس الدقة
              </p>
            </div>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "جاري التقييم..." : "تشغيل التقييم"}
          </button>
        </div>
      </div>

      {evaluation && (
        <>
          {/* Synthetic data summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-3">البيانات الاصطناعية (الحقيقة المعروفة)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <SummaryItem label="إجمالي الحوادث" value={evaluation.syntheticSummary.totalIncidents} />
              <SummaryItem label="الفترة الزمنية" value={`${evaluation.syntheticSummary.dateStart} ← ${evaluation.syntheticSummary.dateEnd}`} />
              <SummaryItem label="المحافظات" value={evaluation.syntheticSummary.governorates} />
              <SummaryItem label="تهريب / تسلل" value={`${evaluation.syntheticSummary.byType["تهريب"] || 0} / ${evaluation.syntheticSummary.byType["تسلل"] || 0}`} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• النمط الموسمي: {evaluation.groundTruth.seasonalPattern}</p>
              <p>• الاتجاه: {evaluation.groundTruth.trend}</p>
              <p>• توزيع النوع: {evaluation.groundTruth.typeSplit}</p>
              <p>• المحافظة الأعلى مخاطر متوقعة: {evaluation.groundTruth.expectedTopGov}</p>
            </div>
          </div>

          {/* Strategic forecast results */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-slate-700" />
                <h3 className="font-semibold">تقييم التوقع الموسمي (شهري)</h3>
              </div>
              {evaluation.strategic.backtestMonths.length > 0 && (
                <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${accuracyColor(evaluation.strategic.accuracy)}`}>
                  دقة: {evaluation.strategic.accuracy}% — {accuracyLabel(evaluation.strategic.accuracy)}
                </div>
              )}
            </div>

            {evaluation.strategic.backtestMonths.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <MetricCard label="متوسط الخطأ المطلق (MAE)" value={evaluation.strategic.mae} unit="حادث" />
                  <MetricCard label="متوسط نسبة الخطأ (MAPE)" value={evaluation.strategic.mape} unit="%" />
                  <MetricCard label="الانحياز (Bias)" value={evaluation.strategic.bias} unit="حادث" />
                </div>

                <div style={{ direction: "ltr", height: 260 }} className="mb-4">
                  <ResponsiveContainer>
                    <BarChart data={evaluation.strategic.backtestMonths} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="actual" name="فعلي" fill="#0f172a" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="predicted" name="متوقع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right py-2 px-3 font-medium">الشهر</th>
                        <th className="text-right py-2 px-3 font-medium">فعلي</th>
                        <th className="text-right py-2 px-3 font-medium">متوقع</th>
                        <th className="text-right py-2 px-3 font-medium">الخطأ</th>
                        <th className="text-right py-2 px-3 font-medium">نسبة الخطأ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluation.strategic.backtestMonths.map((r) => (
                        <tr key={r.month} className="border-b border-border/50">
                          <td className="py-2 px-3 font-mono text-xs">{r.month}</td>
                          <td className="py-2 px-3">{r.actual}</td>
                          <td className="py-2 px-3">{r.predicted}</td>
                          <td className="py-2 px-3">{r.error}</td>
                          <td className={`py-2 px-3 ${r.pctError < 20 ? "text-green-600" : r.pctError < 40 ? "text-amber-600" : "text-red-600"}`}>
                            {r.pctError}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد بيانات كافية للتقييم</p>
            )}
          </div>

          {/* Tactical prediction results */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-slate-700" />
              <h3 className="font-semibold">تقييم التنبؤ التكتيكي (14 يوماً)</h3>
            </div>

            {evaluation.tactical.error ? (
              <p className="text-sm text-red-600">{evaluation.tactical.error}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <ResultCard
                    icon={Calendar}
                    label="إجمالي الحوادث"
                    actual={evaluation.tactical.totalActual}
                    predicted={evaluation.tactical.totalPredicted}
                    accuracy={evaluation.tactical.totalAccuracy}
                  />
                  <ResultCard
                    icon={Users}
                    label="إجمالي المعتقلين"
                    actual={evaluation.tactical.detainedActual}
                    predicted={evaluation.tactical.detainedPredicted}
                    accuracy={evaluation.tactical.detainedAccuracy}
                  />
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                      <MapPin className="w-4 h-4" />
                      <span>المحافظة الأعلى مخاطر</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {evaluation.tactical.topGovCorrect ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{evaluation.tactical.topGovPredicted}</div>
                        <div className="text-xs text-muted-foreground">فعلي: {evaluation.tactical.topGovActual}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      تطابق أعلى 3: {evaluation.tactical.top3Overlap}/{evaluation.tactical.top3Max}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                      <ClipboardCheck className="w-4 h-4" />
                      <span>نوع الحادث</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {evaluation.tactical.typeCorrect ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{evaluation.tactical.typePredicted}</div>
                        <div className="text-xs text-muted-foreground">فعلي: {evaluation.tactical.typeActual}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Governorate comparison */}
                <h4 className="text-sm font-medium mb-2">مقارنة الترتيب الجغرافي (14 يوماً محجوبة)</h4>
                <div style={{ direction: "ltr", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={evaluation.tactical.actualByGov.map((g) => ({
                        name: g.governorate,
                        actual: g.count,
                        predicted: +(evaluation.tactical.predictedRanking.find((r) => r.governorate === g.governorate)?.rawScore || 0).toFixed(1),
                      }))}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="actual" name="فعلي" fill="#0f172a" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="predicted" name="متوقع" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 text-sm text-muted-foreground">
                  المعدل اليومي — فعلي: {evaluation.tactical.actualDailyRate} | متوقع: {evaluation.tactical.predictedDailyRate} | الخطأ: {evaluation.tactical.dailyRateError}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

function MetricCard({ label, value, unit }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value} <span className="text-sm font-normal text-muted-foreground">{unit}</span></div>
    </div>
  );
}

function ResultCard({ icon: Icon, label, actual, predicted, accuracy }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{predicted}</span>
        <span className="text-xs text-muted-foreground">/ {actual} فعلي</span>
      </div>
      <div className={`text-xs mt-1 ${accuracy >= 80 ? "text-green-600" : accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
        دقة: {accuracy}%
      </div>
    </div>
  );
}