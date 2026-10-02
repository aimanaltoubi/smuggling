import React, { useState } from "react";
import { Upload, Download, Loader2, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

export default function DataUploadSection({ onImported }) {
  const [file, setFile] = useState(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    setResult(null);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 300 });

      const response = await base44.functions.invoke("importIncidents", {
        file_url: signed_url,
        replace_existing: replaceExisting,
      });

      const data = response.data;
      if (data.error) {
        setStatus("error");
        setError(data.error);
        if (data.errors) setResult({ errors: data.errors });
        return;
      }

      setStatus("done");
      setResult(data);
      setFile(null);
      onImported?.();
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
          ارفع ملف Excel أو CSV يحتوي على بيانات الحوادث. يجب أن يحتوي الصف الأول على أسماء الأعمدة التالية بالإنجليزية:
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
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">اختر الملف</label>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:cursor-pointer"
            />
            {file && <p className="mt-2 text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="w-4 h-4"
            />
            <span>استبدال البيانات الحالية (حذف كل السجلات الموجودة قبل الاستيراد)</span>
          </label>

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