import React, { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Entity } from "resium";
import Cesium from "@/lib/cesiumConfig";

const OMAN = { lon: 56.0, lat: 21.5, height: 900000 };
const OMAN_BOUNDS = { latMin: 16.5, latMax: 26.6, lngMin: 51.9, lngMax: 60.0 };
const GRID_STEP = 0.5;

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

function buildPriorityGrid(incidents) {
  const cells = {};
  for (const inc of incidents) {
    if (inc.latitude == null || inc.longitude == null) continue;
    const latIdx = Math.floor((inc.latitude - OMAN_BOUNDS.latMin) / GRID_STEP);
    const lngIdx = Math.floor((inc.longitude - OMAN_BOUNDS.lngMin) / GRID_STEP);
    const key = `${latIdx}_${lngIdx}`;
    if (!cells[key]) {
      const south = OMAN_BOUNDS.latMin + latIdx * GRID_STEP;
      const west = OMAN_BOUNDS.lngMin + lngIdx * GRID_STEP;
      cells[key] = { key, south, west, north: south + GRID_STEP, east: west + GRID_STEP, count: 0, detained: 0, types: {} };
    }
    const c = cells[key];
    c.count += 1;
    c.detained += inc.detained_count || 0;
    c.types[inc.incident_type] = (c.types[inc.incident_type] || 0) + 1;
  }
  const arr = Object.values(cells);
  const maxCount = Math.max(1, ...arr.map((c) => c.count));
  for (const c of arr) {
    c.score = c.count / maxCount;
    c.color = priorityColor(c.score);
  }
  return arr.sort((a, b) => b.score - a.score);
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

  const grid = useMemo(() => (hasData ? buildPriorityGrid(incidents) : []), [incidents, hasData]);

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
            شبكة الأولوية
          </button>
          <button
            onClick={() => setView("points")}
            className={`px-3 py-1.5 rounded-lg text-sm ${view === "points" ? "bg-slate-900 text-white" : "bg-muted"}`}
          >
            نقاط الحوادث
          </button>
        </div>
        {view === "grid" && grid.length > 0 && (
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
          {view === "grid" && grid.map((cell) => (
            <Entity
              key={cell.key}
              rectangle={{
                coordinates: Cesium.Rectangle.fromDegrees(cell.west, cell.south, cell.east, cell.north),
                material: cell.color,
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.25),
                outlineWidth: 1,
              }}
              description={`
                <div dir="rtl" style="text-align:right;font-family:sans-serif">
                  <strong>${priorityLabel(cell.score)}</strong><br/>
                  الحوادث: ${cell.count}<br/>
                  المعتقلون: ${cell.detained}<br/>
                  النطاق: ${cell.south.toFixed(1)}-${cell.north.toFixed(1)} خط عرض، ${cell.west.toFixed(1)}-${cell.east.toFixed(1)} طول<br/>
                  ${Object.entries(cell.types).map(([t, n]) => `${t}: ${n}`).join(" | ")}
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
      {view === "grid" && grid.length > 0 && (
        <p className="text-xs text-muted-foreground">
          تُظهر الشبكة {grid.length} خلية نشطة مقسّمة على درجات {GRID_STEP}° — اللون يعكس كثافة الحوادث (الأحمر = أعلى أولوية).
        </p>
      )}
    </div>
  );
}