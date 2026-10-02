import React, { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Entity } from "resium";
import Cesium from "@/lib/cesiumConfig";

const OMAN = { lon: 56.0, lat: 21.5, height: 900000 };

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function fmtDate(d) {
  if (!d) return "-";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "-";
  return `${dt.getDate()} ${MONTHS_AR[dt.getMonth()]} ${dt.getFullYear()}`;
}

function typeColor(t) {
  if (t === "تهريب") return Cesium.Color.RED;
  if (t === "تسلل") return Cesium.Color.ROYALBLUE;
  return Cesium.Color.GRAY;
}

// Priority color: green (low) -> amber (mid) -> red (high)
function priorityColor(t) {
  const low = Cesium.Color.fromBytes(34, 197, 94);
  const mid = Cesium.Color.fromBytes(245, 158, 11);
  const high = Cesium.Color.fromBytes(220, 38, 38);
  const c = t < 0.5
    ? Cesium.Color.lerp(low, mid, t * 2, new Cesium.Color())
    : Cesium.Color.lerp(mid, high, (t - 0.5) * 2, new Cesium.Color());
  return c.withAlpha(0.5);
}

function priorityLabel(t) {
  if (t >= 0.66) return "أولوية عالية";
  if (t >= 0.33) return "أولوية متوسطة";
  return "أولوية منخفضة";
}

// Named border sectors covering Oman's perimeter.
const BORDER_SECTORS = [
  { id: "uae", name: "حدود الإمارات", west: 55.8, south: 24.2, east: 60.0, north: 26.6 },
  { id: "saudi", name: "حدود السعودية", west: 51.9, south: 19.5, east: 55.0, north: 24.2 },
  { id: "yemen", name: "حدود اليمن", west: 51.9, south: 16.5, east: 55.0, north: 19.5 },
  { id: "coast", name: "الساحل", west: 55.0, south: 16.5, east: 60.0, north: 24.2 },
];

function sectorFor(lat, lng) {
  if (lat >= 24.2) return "uae";
  if (lat <= 19.5) return lng <= 55.0 ? "yemen" : "coast";
  return lng <= 55.0 ? "saudi" : "coast";
}

function buildBorderSectors(incidents) {
  const stats = {};
  for (const s of BORDER_SECTORS) stats[s.id] = { ...s, count: 0, detained: 0, types: {} };
  for (const inc of incidents) {
    if (inc.latitude == null || inc.longitude == null) continue;
    const id = sectorFor(inc.latitude, inc.longitude);
    if (!id) continue;
    const c = stats[id];
    c.count += 1;
    c.detained += inc.detained_count || 0;
    c.types[inc.incident_type] = (c.types[inc.incident_type] || 0) + 1;
  }
  const maxCount = Math.max(1, ...Object.values(stats).map((s) => s.count));
  for (const s of Object.values(stats)) {
    s.score = s.count / maxCount;
    s.color = priorityColor(s.score);
  }
  return Object.values(stats).sort((a, b) => b.score - a.score);
}

export default function IncidentMap({ incidents, prediction, height = 420 }) {
  const hasData = incidents && incidents.length > 0;
  const shown = hasData ? incidents.slice(0, 400) : [];
  const viewerRef = useRef(null);
  const [view, setView] = useState("grid"); // "grid" | "points"

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(OMAN.lon, OMAN.lat, OMAN.height),
      });
    }
  }, []);

  const sectors = useMemo(() => (hasData ? buildBorderSectors(incidents) : []), [incidents, hasData]);

  const predCoords = useMemo(() => {
    if (!prediction) return null;
    const g = prediction.where.governorate;
    const rec = incidents.find((i) => i.governorate === g);
    return rec ? { lon: rec.longitude, lat: rec.latitude } : null;
  }, [prediction, incidents]);

  return (
    <div className="space-y-2" dir="rtl">
      {/* View toggle + legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 rounded-lg text-sm ${view === "grid" ? "bg-slate-900 text-white" : "bg-muted"}`}
          >
            قطاعات الحدود
          </button>
          <button
            onClick={() => setView("points")}
            className={`px-3 py-1.5 rounded-lg text-sm ${view === "points" ? "bg-slate-900 text-white" : "bg-muted"}`}
          >
            نقاط الحوادث
          </button>
        </div>
        {view === "grid" && sectors.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>أولوية:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgb(34,197,94)" }} />منخفضة</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgb(245,158,11)" }} />متوسطة</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "rgb(220,38,38)" }} />عالية</span>
          </div>
        )}
      </div>

      <div
        style={{
          height,
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <Viewer
          ref={viewerRef}
          full
          baseLayerPicker={false}
          geocoder={false}
          homeButton={false}
          navigationHelpButton={false}
          sceneModePicker={false}
          timeline={false}
          animation={false}
          fullscreenButton={false}
          selectionIndicator={false}
          infoBox
        >
          {view === "grid" && sectors.map((s) => (
            <Entity
              key={s.id}
              position={Cesium.Cartesian3.fromDegrees((s.west + s.east) / 2, (s.south + s.north) / 2)}
              rectangle={{
                coordinates: Cesium.Rectangle.fromDegrees(s.west, s.south, s.east, s.north),
                material: s.color,
                outline: true,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
              }}
              label={{
                text: `${s.name}\n${s.count} حادث`,
                font: "14px sans-serif",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString("rgba(0,0,0,0.55)"),
                backgroundPadding: new Cesium.Cartesian2(10, 8),
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              }}
              description={`
                <div dir="rtl" style="text-align:right;font-family:sans-serif">
                  <strong>${s.name}</strong> — ${priorityLabel(s.score)}<br/>
                  الحوادث: ${s.count}<br/>
                  المعتقلون: ${s.detained}<br/>
                  النطاق: ${s.south.toFixed(1)}-${s.north.toFixed(1)} خط عرض، ${s.west.toFixed(1)}-${s.east.toFixed(1)} طول<br/>
                  ${Object.entries(s.types).map(([t, n]) => `${t}: ${n}`).join(" | ")}
                </div>
              `}
            />
          ))}

          {view === "points" && shown.map((inc, idx) => (
            <Entity
              key={idx}
              position={Cesium.Cartesian3.fromDegrees(inc.longitude, inc.latitude)}
              point={{
                pixelSize: 6 + Math.min(8, (inc.detained_count || 1) / 2),
                color: typeColor(inc.incident_type),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
              }}
              description={`
                <div dir="rtl" style="text-align:right;font-family:sans-serif">
                  <strong>${inc.incident_type}</strong><br/>
                  ${inc.location_name} - ${inc.governorate}<br/>
                  التاريخ: ${fmtDate(inc.incident_date)}<br/>
                  المعتقلون: ${inc.detained_count}
                </div>
              `}
            />
          ))}

          {prediction && predCoords && (
            <Entity
              position={Cesium.Cartesian3.fromDegrees(predCoords.lon, predCoords.lat)}
              point={{
                pixelSize: 16,
                color: Cesium.Color.ORANGE,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              }}
              description={`
                <div dir="rtl" style="text-align:right;font-family:sans-serif">
                  <strong>التنبؤ: الحدث القادم</strong><br/>
                  المحافظة: ${prediction.where.governorate}<br/>
                  الفترة: ${prediction.forecastWindow.startLabel} ← ${prediction.forecastWindow.endLabel}<br/>
                  الحوادث المتوقعة: ${prediction.when.totalExpectedIncidents}<br/>
                  المعتقلون المتوقعون: ${prediction.howMany.expectedTotalDetained}
                </div>
              `}
            />
          )}
        </Viewer>
      </div>
      {view === "grid" && sectors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sectors.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-lg font-bold">{s.count}</div>
              <div className="text-xs text-muted-foreground">{priorityLabel(s.score)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}