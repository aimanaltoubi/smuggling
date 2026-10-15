import React, { useState } from "react";
import { Upload, Download, Loader2, CheckCircle, AlertCircle, FileSpreadsheet, BarChart3 } from "lucide-react";
import { parseIncidentCsv } from "@/lib/analytics/csvImport";

const COLUMNS = [
  { name: "incident_id", type: "نص", required: true, example: "INC-001" },
  { name: "incident_date", type: "تاريخ (YYYY-MM-DD)", required: true, example: "2024-01-15" },
  { name: "location_name", type: "نص", required: true, example: "ولاية صحار" },
  { name: "governorate", type: "نص", required: true, example: "شمال الباطنة" },
  { name: "latitude", type: "رقم", required: true, example: "24.34" },
  { name: "longitude", type: "رقم", required: true, example: "56.91" },
  { name: "incident_type", type: "تهريب أو تسلل", required: true, example: "تهريب" },
  { name: "ethnicity", type: "نص", required: false, example: "—" },
  { name: "detained_count", type: "رقم صحيح", required: true, example: "3" },
  { name: "details", type: "نص", required: false, example: "—" },
];

export default function DataUploadSection({ onImported, onGoToEDA }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    setResult(null);
    try {
      const { rows, errors } = await parseIncidentCsv(file);
      if (!rows.length) {
        setStatus("error");
        setError("No valid incident rows found in this CSV.");
        setResult({ errors });
        return;
      }

      setStatus("done");
      setResult({ imported: rows.length, failed: errors.length, errors });
      setFile(null);
      onImported?.(rows);
    } catch (e) {
      setStatus("error");
      setError(e.message || "فشل رفع البيانات");
    }
  };

  const downloadTemplate = () => {
    const headers = "incident_id,incident_date,location_name,governorate,latitude,longitude,incident_type,ethnicity,detained_count,details";
    const sample = "INC-001,2024-01-15,ولاية صحار,شمال الباطنة,24.34,56.91,تهريب,,3,تفاصيل الحادث";
    const csv = `${headers}\n${sample}`;
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "incident_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-5 h-5 text-slate-700" />
          <h3 className="font-semibold">رفع بيانات الحوادث</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          اختر ملف CSV محلياً يحتوي على بيانات الحوادث. يجب أن يحتوي الصف الأول على أسماء الأعمدة التالية بالإنجليزية:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-right py-2 px-3 font-medium">اسم العمود</th>
                <th className="text-right py-2 px-3 font-medium">النوع</th>
                <th className="text-right py-2 px-3 font-medium">مطلوب</th>
                <th className="text-right py-2 px-3 font-medium">مثال</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.name} className="border-b border-border/50">
                  <td className="py-2 px-3 font-mono text-xs">{c.name}</td>
                  <td className="py-2 px-3">{c.type}</td>
                  <td className="py-2 px-3">{c.required ? "✅" : "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{c.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={downloadTemplate}
          className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <Download className="w-4 h-4" />
          تحميل قالب جاهز (CSV)
        </button>
        <a
          href={`${import.meta.env.BASE_URL}sample-incidents.csv`}
          download="sample-incidents.csv"
          className="mt-2 flex items-center gap-2 text-sm text-green-700 hover:underline"
        >
          <Download className="w-4 h-4" />
          تنزيل بيانات تجريبية كاملة (4 سنوات)
        </a>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">اختر الملف</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:cursor-pointer"
            />
            {file && <p className="mt-2 text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || status === "uploading"}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white disabled:opacity-50 disabled:cursor-not-allowed w-fit"
          >
            {status === "uploading" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {status === "uploading" ? "جاري الرفع والمعالجة..." : "رفع البيانات"}
          </button>
        </div>
      </div>

      {status === "done" && result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">تم استيراد البيانات بنجاح</span>
          </div>
          <div className="mt-2 text-sm text-green-600">
            تم استيراد {result.imported} سجل{result.failed ? `، وفشل ${result.failed} سجل` : ""}.
            {result.replaced ? " تم استبدال البيانات السابقة." : ""}
          </div>
          {onGoToEDA && (
            <button
              onClick={onGoToEDA}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700"
            >
              <BarChart3 className="w-4 h-4" />
              تحليل البيانات (EDA)
            </button>
          )}
          {result.errors?.length > 0 && (
            <ul className="mt-3 text-xs text-amber-700 list-disc pr-5 space-y-0.5">
              {result.errors.slice(0, 20).map((message, index) => <li key={index}>{message}</li>)}
            </ul>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">فشل الاستيراد</span>
          </div>
          <div className="mt-2 text-sm text-red-600">{error}</div>
          {result?.errors?.length > 0 && (
            <ul className="mt-2 text-xs text-red-500 list-disc pr-5 space-y-0.5">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}