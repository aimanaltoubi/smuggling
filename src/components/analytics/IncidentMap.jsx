import React, { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Entity } from "resium";
import Cesium from "@/lib/cesiumConfig";
import { pipelineTacticalPrediction } from "@/lib/pipeline/PipelineBridge";
import MapOverlay from "./MapOverlay";

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

/* ---------- PRIO-GRID (standard global 0.5° grid) ---------- */
function prioidFromLatLng(lat, lng) {
  const col = Math.floor((lng + 180) / 0.5) + 1;
  const row = Math.floor((lat + 90) / 0.5) + 1;
  return (row - 1) * 720 + col;
}
function cellBoundsFromPrioid(prioid) {
  const row = Math.ceil(prioid / 720);
  const col = prioid - (row - 1) * 720;
  const west = -180 + (col - 1) * 0.5;
  const south = -90 + (row - 1) * 0.5;
  return { west, south, east: west + 0.5, north: south + 0.5, row, col };
}
// Entire Oman broken into PRIO-GRID cells; prediction areas highlighted.
const OMAN_BOUNDS = { latMin: 16.5, latMax: 26.6, lngMin: 51.9, lngMax: 60.0 };
function buildOmanPrioGrid(incidents, prediction) {
  // Aggregate incidents per cell
  const agg = {};
  for (const inc of incidents) {
    if (inc.latitude == null || inc.longitude == null) continue;
    const id = prioidFromLatLng(inc.latitude, inc.longitude);
    if (!agg[id]) agg[id] = { prioid: id, count: 0, detained: 0, types: {}, govs: {} };
    const c = agg[id];
    c.count += 1;
    c.detained += inc.detained_count || 0;
    c.types[inc.incident_type] = (c.types[inc.incident_type] || 0) + 1;
    if (inc.governorate) c.govs[inc.governorate] = (c.govs[inc.governorate] || 0) + 1;
  }
  // Governorate risk ranking from the prediction model
  const govRisk = {};
  if (prediction?.where?.ranking) prediction.where.ranking.forEach((r) => { govRisk[r.governorate] = r.score; });
  const predictedGov = prediction?.where?.governorate || null;
  // Peak predicted cell (from prediction coordinates if available)
  let peakPrioid = null;
  if (prediction?.where) {
    const rec = incidents.find((i) => i.governorate === predictedGov);
    if (rec) peakPrioid = prioidFromLatLng(rec.latitude, rec.longitude);
  }
  // Enumerate ALL cells intersecting the Oman bounding box
  const all = [];
  const startLng = Math.floor((OMAN_BOUNDS.lngMin + 180) / 0.5) * 0.5 - 180;
  const startLat = Math.floor((OMAN_BOUNDS.latMin + 90) / 0.5) * 0.5 - 90;
  for (let lng = startLng; lng < OMAN_BOUNDS.lngMax; lng += 0.5) {
    for (let lat = startLat; lat < OMAN_BOUNDS.latMax; lat += 0.5) {
      const id = prioidFromLatLng(lat + 0.001, lng + 0.001);
      const b = cellBoundsFromPrioid(id);
      const e = agg[id];
      const count = e?.count || 0;
      const detained = e?.detained || 0;
      let gov = null;
      if (e && Object.keys(e.govs).length) gov = Object.entries(e.govs).sort((x, y) => y[1] - x[1])[0][0];
      all.push({
        prioid: id, bounds: b, count, detained,
        governorate: gov,
        govRisk: gov ? govRisk[gov] || 0 : 0,
        isPredictionArea: gov === predictedGov,
        isPeak: id === peakPrioid,
      });
    }
  }
  const maxCount = Math.max(1, ...all.map((c) => c.count));
  for (const c of all) {
    c.baseRisk = c.count / maxCount;
    if (c.isPeak) {
      c.color = Cesium.Color.fromHsl(0.12, 1.0, 0.5, 0.85); // bright orange peak
    } else if (c.isPredictionArea) {
      c.color = Cesium.Color.fromHsl(0.08, 0.85, 0.5, 0.55); // orange highlight
    } else if (c.count > 0) {
      c.color = Cesium.Color.fromHsl(0.0, c.baseRisk, 0.5, 0.35 + c.baseRisk * 0.3);
    } else {
      c.color = Cesium.Color.fromHsl(0.6, 0.08, 0.7, 0.14); // visible empty cell across Oman
    }
  }
  return all;
}

/* ---------- Named border sectors ---------- */
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
  const [view, setView] = useState("prio"); // "prio" | "sectors" | "points"
  const [horizon, setHorizon] = useState("14"); // "14" (two weeks) | "30" (one month)

  const pred14 = useMemo(() => (hasData ? pipelineTacticalPrediction(incidents, { horizonDays: 14 }) : null), [incidents, hasData]);
  const pred30 = useMemo(() => (hasData ? pipelineTacticalPrediction(incidents, { horizonDays: 30 }) : null), [incidents, hasData]);
  const activePrediction = horizon === "14" ? pred14 : pred30;

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(OMAN.lon, OMAN.lat, OMAN.height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
      duration: 1.6,
    });
  }, []);

  const prioGrid = useMemo(() => (hasData ? buildOmanPrioGrid(incidents, activePrediction) : []), [incidents, hasData, activePrediction]);
  const sectors = useMemo(() => (hasData ? buildBorderSectors(incidents) : []), [incidents, hasData]);

  const predCoords = useMemo(() => {
    if (!activePrediction) return null;
    const g = activePrediction.where.governorate;
    const rec = incidents.find((i) => i.governorate === g);
    return rec ? { lon: rec.longitude, lat: rec.latitude } : null;
  }, [activePrediction, incidents]);

  const overlayItems = useMemo(() => {
    if (view === "sectors") {
      return sectors.map((s) => ({
        id: `sector-${s.id}`,
        lon: (s.west + s.east) / 2,
        lat: (s.south + s.north) / 2,
        content: (
          <div className="px-2.5 py-1 rounded-md bg-black/75 text-white text-xs font-semibold whitespace-nowrap border border-white/25 shadow-lg">
            {s.name} — {s.count} حادث
          </div>
        ),
      }));
    }
    if (view === "prio") {
      const items = [];
      const peak = prioGrid.find((c) => c.isPeak);
      if (peak) {
        items.push({
          id: `peak-${peak.prioid}`,
          lon: (peak.bounds.west + peak.bounds.east) / 2,
          lat: (peak.bounds.south + peak.bounds.north) / 2,
          content: (
            <div className="px-2.5 py-1 rounded-md bg-amber-700/90 text-white text-xs font-bold whitespace-nowrap border border-white/50 shadow-lg">
              ★ {peak.governorate || "منطقة التنبؤ"}
            </div>
          ),
        });
      }
      if (predCoords && activePrediction) {
        items.push({
          id: "pred-point",
          lon: predCoords.lon,
          lat: predCoords.lat,
          content: (
            <div className="px-2.5 py-1 rounded-md bg-orange-600/90 text-white text-xs font-bold whitespace-nowrap border border-white/50 shadow-lg">
              التنبؤ: {activePrediction.where.governorate}
            </div>
          ),
        });
      }
      return items;
    }
    return [];
  }, [view, sectors, prioGrid, predCoords, activePrediction]);

  const btn = (active) => `px-3 py-1.5 rounded-lg text-sm ${active ? "bg-slate-900 text-white" : "bg-muted"}`;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setView("prio")} className={btn(view === "prio")}>خريطة المخاطر</button>
          <button onClick={() => setView("sectors")} className={btn(view === "sectors")}>مناطق الحدود</button>
          <button onClick={() => setView("points")} className={btn(view === "points")}>مواقع الحوادث</button>
        </div>
        {view === "prio" && prioGrid.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>المخاطر:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0,20%,50%)" }} />منخفضة</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0,60%,50%)" }} />متوسطة</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0,100%,50%)" }} />عالية</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(30,85%,50%)" }} />منطقة تنبؤ</span>
          </div>
        )}
      </div>

      {view === "prio" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">أفق التنبؤ:</span>
          <button onClick={() => setHorizon("14")} className={btn(horizon === "14")}>أسبوعان</button>
          <button onClick={() => setHorizon("30")} className={btn(horizon === "30")}>شهر</button>
        </div>
      )}

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
          baseLayer={false}
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
          {view === "prio" && prioGrid.map((cell) => (
              <Entity
                key={cell.prioid}
                position={Cesium.Cartesian3.fromDegrees((cell.bounds.west + cell.bounds.east) / 2, (cell.bounds.south + cell.bounds.north) / 2)}
                rectangle={{
                  coordinates: Cesium.Rectangle.fromDegrees(cell.bounds.west, cell.bounds.south, cell.bounds.east, cell.bounds.north),
                  material: cell.color,
                  classificationType: Cesium.ClassificationType.TERRAIN,
                  outline: true,
                  outlineColor: cell.isPeak
                    ? Cesium.Color.WHITE
                    : cell.isPredictionArea
                      ? Cesium.Color.ORANGE
                      : Cesium.Color.WHITE.withAlpha(0.22),
                  outlineWidth: cell.isPeak ? 2 : 1,
                }}
                description={`
                  <div dir="rtl" style="text-align:right;font-family:sans-serif">
                    <strong>${cell.governorate ? "منطقة " + cell.governorate : "منطقة غير محددة"}</strong>${cell.isPeak ? " ★ ذروة التنبؤ" : ""}<br/>
                    ${cell.isPredictionArea ? "منطقة تنبؤ محتملة<br/>" : ""}
                    مستوى الخطر: ${(cell.baseRisk * 100).toFixed(0)}%${cell.govRisk ? ` | مخاطر المحافظة: ${(cell.govRisk * 100).toFixed(0)}%` : ""}<br/>
                    عدد الحوادث السابقة: ${cell.count}<br/>
                    المعتقلون: ${cell.detained}<br/>
                    المحافظة: ${cell.governorate || "غير محدد"}
                  </div>
                `}
              />
            ))}

          {view === "sectors" && sectors.map((s) => (
            <Entity
              key={s.id}
              position={Cesium.Cartesian3.fromDegrees((s.west + s.east) / 2, (s.south + s.north) / 2)}
              rectangle={{
                coordinates: Cesium.Rectangle.fromDegrees(s.west, s.south, s.east, s.north),
                material: s.color,
                classificationType: Cesium.ClassificationType.TERRAIN,
                outline: true,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
              }}
              description={`
                <div dir="rtl" style="text-align:right;font-family:sans-serif">
                  <strong>${s.name}</strong> — ${priorityLabel(s.score)}<br/>
                  الحوادث: ${s.count}<br/>
                  المعتقلون: ${s.detained}<br/>
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

          {view === "prio" && activePrediction && predCoords && (
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
                  <strong>التنبؤ: الحدث القادم (${horizon === "14" ? "أسبوعان" : "شهر"})</strong><br/>
                  المحافظة: ${activePrediction.where.governorate}<br/>
                  الفترة: ${activePrediction.forecastWindow.startLabel} ← ${activePrediction.forecastWindow.endLabel}<br/>
                  الحوادث المتوقعة: ${activePrediction.when.totalExpectedIncidents}<br/>
                  المعتقلون المتوقعون: ${activePrediction.howMany.expectedTotalDetained}
                </div>
              `}
            />
          )}
        </Viewer>
        <MapOverlay viewerRef={viewerRef} items={overlayItems} />
      </div>

      {view === "prio" && prioGrid.length > 0 && activePrediction && (
        <p className="text-xs text-muted-foreground">
          خريطة المخاطر تغطي سلطنة عمان بالكامل — {prioGrid.length} منطقة. أفق التنبؤ الحالي: {horizon === "14" ? "أسبوعان" : "شهر"} ({activePrediction.forecastWindow.startLabel} ← {activePrediction.forecastWindow.endLabel}) — {activePrediction.when.totalExpectedIncidents} حادث متوقع، {activePrediction.howMany.expectedTotalDetained} معتقل. المناطق البرتقالية هي مواقع التنبؤ المحتملة (★ أعلى منطقة خطورة).
        </p>
      )}
      {view === "sectors" && sectors.length > 0 && (
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