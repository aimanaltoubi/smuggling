import React, { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, Rectangle, ScaleControl, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { circleMarker, latLngBounds, layerGroup } from "leaflet";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./IncidentMap.css";
import { useTacticalPrediction } from "@/lib/pipeline/tacticalClient";
import omanPlaces from "@/lib/analytics/omanPlaces.json";
import omanBoundaries from "@/lib/analytics/omanBoundaries.json";
import { BORDER_DISTANCE_KM, buildBorderStatistics } from "@/lib/analytics/borderAnalytics";
import OfflineBasemap from "./OfflineBasemap";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function fmtDate(d) {
  if (!d) return "-";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "-";
  return `${dt.getDate()} ${MONTHS_AR[dt.getMonth()]} ${dt.getFullYear()}`;
}

function typeColor(t) {
  if (t === "تهريب") return "#dc2626";
  if (t === "تسلل") return "#2563eb";
  return "#6b7280";
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
const GOVERNORATE_LABELS = [
  { id: "musandam", name: "مسندم", lon: 56.25, lat: 26.1 },
  { id: "buraymi", name: "البريمي", lon: 55.9, lat: 24.15 },
  { id: "north-batinah", name: "شمال الباطنة", lon: 56.8, lat: 24.35 },
  { id: "south-batinah", name: "جنوب الباطنة", lon: 57.35, lat: 23.55 },
  { id: "muscat", name: "مسقط", lon: 58.65, lat: 23.45 },
  { id: "dhahirah", name: "الظاهرة", lon: 55.9, lat: 22.8 },
  { id: "dakhiliyah", name: "الداخلية", lon: 57.35, lat: 22.45 },
  { id: "north-sharqiyah", name: "شمال الشرقية", lon: 58.5, lat: 22.1 },
  { id: "south-sharqiyah", name: "جنوب الشرقية", lon: 59.2, lat: 21.25 },
  { id: "wusta", name: "الوسطى", lon: 56.4, lat: 19.6 },
  { id: "dhofar", name: "ظفار", lon: 54.1, lat: 17.8 },
];
const MAP_BOUNDS = latLngBounds([OMAN_BOUNDS.latMin, OMAN_BOUNDS.lngMin], [OMAN_BOUNDS.latMax, OMAN_BOUNDS.lngMax]);
const PLACE_ZOOM_LEVELS = { city: 0, town: 1, village: 2, suburb: 3, hamlet: 3, neighbourhood: 4 };

function MapViewport() {
  const map = useMapEvents({ zoomend: () => { map.getContainer().dataset.zoom = String(map.getZoom()); } });
  useEffect(() => {
    const resize = () => {
      map.invalidateSize();
      const minZoom = map.getBoundsZoom(MAP_BOUNDS, false, [16, 16]);
      map.setMinZoom(minZoom);
      if (map.getZoom() < minZoom) map.fitBounds(MAP_BOUNDS, { padding: [8, 8], animate: false });
    };
    map.fitBounds(MAP_BOUNDS, { padding: [8, 8], animate: false });
    resize();
    map.getContainer().dataset.zoom = String(map.getZoom());
    const observer = new ResizeObserver(resize);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return <button type="button" className="oman-map-reset" title="عرض سلطنة عمان" aria-label="عرض سلطنة عمان" onClick={() => map.fitBounds(MAP_BOUNDS, { padding: [8, 8] })}><LocateFixed size={18} /></button>;
}

function PlaceSearch() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalize = value => value.toLocaleLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064b-\u065f]/g, "");
  const normalizedQuery = normalize(query.trim());
  const matches = normalizedQuery ? omanPlaces.places.filter(place => normalize(`${place.name} ${place.englishName}`).includes(normalizedQuery)).slice(0, 8) : [];
  const select = place => {
    map.flyTo([place.lat, place.lon], 13, { duration: 0.5 });
    setQuery(place.name);
    setOpen(false);
  };
  return <div className="oman-map-search" dir="rtl" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <Search size={16} aria-hidden="true" />
    <input type="search" role="combobox" aria-label="البحث عن مكان" aria-autocomplete="list" aria-expanded={open && Boolean(normalizedQuery)} aria-controls="oman-place-results" placeholder="البحث عن مكان" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }} onKeyDown={event => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setActiveIndex((activeIndex + 1) % matches.length); }
      if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setActiveIndex((activeIndex + matches.length - 1) % matches.length); }
      if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); select(matches[activeIndex]); }
    }} />
    {query && <button type="button" title="مسح البحث" aria-label="مسح البحث" onClick={() => { setQuery(""); setOpen(false); }}><X size={15} /></button>}
    {open && normalizedQuery && <div id="oman-place-results" role="listbox" className="oman-place-results">
      {matches.map((place, index) => <button type="button" role="option" aria-selected={index === activeIndex} key={place.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(place)}><MapPin size={14} />{place.name}</button>)}
      {!matches.length && <div className="oman-place-empty">لا توجد نتائج</div>}
    </div>}
  </div>;
}

function GeographicLabels({ streets }) {
  const [, setRevision] = useState(0);
  const map = useMapEvents({ zoomend: () => setRevision((revision) => revision + 1), moveend: () => setRevision((revision) => revision + 1), resize: () => setRevision((revision) => revision + 1) });
  const size = map.getSize();
  const occupied = [
    { left: 0, right: 94, top: 0, bottom: 82 },
    { left: Math.max(100, size.x - 310), right: size.x, top: 0, bottom: 60 },
    { left: 0, right: size.x, top: size.y - 36, bottom: size.y },
  ];
  const relativeZoom = map.getZoom() - map.getBoundsZoom(MAP_BOUNDS);
  const visibleBounds = map.getBounds();
  const placeLabels = omanPlaces.places
    .filter((place) => relativeZoom >= PLACE_ZOOM_LEVELS[place.kind] && visibleBounds.contains([place.lat, place.lon]))
    .map((place) => ({ ...place, governorate: false }));
  if (map.getZoom() >= 14) {
    const center = map.getCenter();
    for (const street of streets) {
      let closest;
      let closestDistance = Infinity;
      for (const coordinate of street.coordinates) {
        if (!visibleBounds.contains([coordinate[1], coordinate[0]])) continue;
        const distance = (coordinate[1] - center.lat) ** 2 + (coordinate[0] - center.lng) ** 2;
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = coordinate;
        }
      }
      if (closest) placeLabels.push({ ...street, lat: closest[1], lon: closest[0] });
    }
  }
  const governorateLabels = GOVERNORATE_LABELS.map((label) => ({ ...label, governorate: true }));
  const candidates = relativeZoom >= 1 ? [...placeLabels, ...governorateLabels] : [...governorateLabels, ...placeLabels];
  const labels = candidates.filter((label) => {
    const point = map.latLngToContainerPoint([label.lat, label.lon]);
    const width = label.name.length * 8 + 16;
    const bounds = { left: point.x - width / 2, right: point.x + width / 2, top: point.y - 12, bottom: point.y + 12 };
    if (bounds.left < 0 || bounds.right > size.x || bounds.top < 0 || bounds.bottom > size.y
      || occupied.some((other) => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top)) return false;
    occupied.push(bounds);
    return true;
  });
  return labels.map((label) => <CircleMarker key={label.id} center={[label.lat, label.lon]} radius={label.governorate || label.kind === "street" ? 0 : 2} interactive={false} pathOptions={{ color: "#374151", fillOpacity: 1, opacity: label.governorate || label.kind === "street" ? 0 : 1 }}><Tooltip permanent direction="center" className={label.governorate ? "oman-governorate-label" : label.kind === "street" ? "oman-street-label" : "oman-city-label"}><span title={label.englishName || label.name}>{label.name}</span></Tooltip></CircleMarker>);
}
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Thousands of per-incident React components made the tab sluggish; one plain
// Leaflet layer group on the canvas renderer is much cheaper to mount.
function IncidentPoints({ incidents }) {
  const map = useMap();
  useEffect(() => {
    const group = layerGroup(incidents.map((incident) => circleMarker([Number(incident.latitude), Number(incident.longitude)], { radius: 5, color: "#ffffff", weight: 1, fillColor: typeColor(incident.incident_type), fillOpacity: 0.9 })
      .bindPopup(`<div dir="rtl"><strong>${escapeHtml(incident.incident_type)}</strong><br />${escapeHtml(incident.location_name)}<br />${escapeHtml(incident.governorate)}<br />التاريخ: ${escapeHtml(fmtDate(incident.incident_date))}<br />المعتقلون: ${escapeHtml(incident.detained_count)}</div>`)));
    group.addTo(map);
    return () => { group.remove(); };
  }, [map, incidents]);
  return null;
}

function buildOmanPrioGrid(incidents, prediction) {
  // Aggregate incidents per cell
  const agg = {};
  const govCounts = {};
  for (const inc of incidents) {
    if (inc.latitude == null || inc.longitude == null) continue;
    const id = prioidFromLatLng(inc.latitude, inc.longitude);
    if (!agg[id]) agg[id] = { prioid: id, count: 0, detained: 0, types: {}, govs: {}, latSum: 0, lngSum: 0 };
    const c = agg[id];
    c.count += 1;
    c.detained += inc.detained_count || 0;
    c.latSum += Number(inc.latitude);
    c.lngSum += Number(inc.longitude);
    c.types[inc.incident_type] = (c.types[inc.incident_type] || 0) + 1;
    if (inc.governorate) {
      c.govs[inc.governorate] = (c.govs[inc.governorate] || 0) + 1;
      govCounts[inc.governorate] = (govCounts[inc.governorate] || 0) + 1;
    }
  }
  // Governorate risk ranking from the prediction model
  const govRisk = {};
  if (prediction?.where?.ranking) prediction.where.ranking.forEach((r) => { govRisk[r.governorate] = r.score; });
  const predictedGov = prediction?.where?.governorate || null;
  // Only cells with observed activity are drawn; empty sea/desert cells added nothing but clutter.
  const all = Object.values(agg).map((e) => {
    const gov = Object.keys(e.govs).length ? Object.entries(e.govs).sort((x, y) => y[1] - x[1])[0][0] : null;
    // Predicted governorate share spread over its cells by past within-governorate distribution.
    const forecastShare = gov && govCounts[gov] ? (govRisk[gov] || 0) * (e.govs[gov] / govCounts[gov]) : 0;
    return {
      prioid: e.prioid, bounds: cellBoundsFromPrioid(e.prioid), count: e.count, detained: e.detained, types: e.types,
      center: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
      governorate: gov, govRisk: gov ? govRisk[gov] || 0 : 0, forecastShare,
      isPredictionArea: gov === predictedGov, isPeak: false,
    };
  });
  const peak = all.filter((c) => c.isPredictionArea).sort((a, b) => b.forecastShare - a.forecastShare)[0];
  if (peak) peak.isPeak = true;
  const maxCount = Math.max(1, ...all.map((c) => c.count));
  const maxShare = Math.max(1e-9, ...all.map((c) => c.forecastShare));
  for (const c of all) {
    c.baseRisk = c.count / maxCount;
    c.forecastIntensity = c.forecastShare / maxShare;
    if (c.isPeak) {
      c.color = "#f59e0b";
    } else if (c.isPredictionArea) {
      c.color = "#ea580c";
    } else {
      c.color = `hsl(0, ${c.baseRisk * 100}%, 50%)`;
    }
  }
  return all;
}

const BORDER_COLORS = { uae: "#9f3a38", saudi: "#a66a25", yemen: "#4d7e46", coast: "#2a7e9b" };

export default function IncidentMap({ incidents, height = 560, observationEnd, prediction }) {
  const hasData = incidents && incidents.length > 0;
  const shown = useMemo(() => (hasData
    ? incidents.filter((incident) => (
      incident.latitude != null
      && incident.longitude != null
      && Number.isFinite(Number(incident.latitude))
      && Number.isFinite(Number(incident.longitude))
      && Number(incident.latitude) >= -90
      && Number(incident.latitude) <= 90
      && Number(incident.longitude) >= -180
      && Number(incident.longitude) <= 180
    ))
    : []), [incidents, hasData]);
  const [streetLabels, setStreetLabels] = useState([]);
  const [view, setView] = useState("points"); // "prio" | "sectors" | "points"
  const [horizon, setHorizon] = useState("14"); // "14" (two weeks) | "30" (one month)
  const pointTypeCounts = useMemo(() => shown.reduce((counts, incident) => {
    counts[incident.incident_type] = (counts[incident.incident_type] || 0) + 1;
    return counts;
  }, {}), [shown]);

  // The 14-day run is shared from the parent; the 30-day run is only computed when asked for.
  const own14 = useTacticalPrediction(incidents, { horizonDays: 14, observationEnd }, hasData && prediction === undefined);
  const pred14 = prediction === undefined ? own14.prediction : prediction;
  const run30 = useTacticalPrediction(incidents, { horizonDays: 30, observationEnd }, hasData && view === "prio" && horizon === "30");
  const activePrediction = horizon === "14" ? pred14 : run30.prediction;
  const predictionPending = horizon === "30" ? run30.status === "computing" : prediction === undefined && own14.status === "computing";

  const prioGrid = useMemo(() => (hasData ? buildOmanPrioGrid(incidents, activePrediction) : []), [incidents, hasData, activePrediction]);
  const sectors = useMemo(() => (hasData && view === "sectors" ? buildBorderStatistics(incidents, omanBoundaries.features) : []), [incidents, hasData, view]);

  const predCoords = useMemo(() => {
    const peak = prioGrid.find((cell) => cell.isPeak);
    return peak ? { lon: peak.center.lng, lat: peak.center.lat } : null;
  }, [prioGrid]);

  const btn = (active) => `px-3 py-1.5 rounded-lg text-sm ${active ? "bg-slate-900 text-white" : "bg-muted"}`;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView("prio")} className={btn(view === "prio")}>خريطة النشاط ومؤشرات التنبؤ</button>
          <button onClick={() => setView("sectors")} className={btn(view === "sectors")}>مناطق الحدود</button>
          <button onClick={() => setView("points")} className={btn(view === "points")}>مواقع الحوادث</button>
        </div>
        {view === "prio" && prioGrid.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>نشاط سابق:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0,20%,50%)", opacity: 0.5 }} />منخفض</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0,100%,50%)", opacity: 0.5 }} />عالٍ</span>
            <span>| المحافظة المتوقعة:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#ea580c", opacity: 0.2 }} />حصة متوقعة ضعيفة</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-amber-700" style={{ background: "#f59e0b" }} />ذروة التنبؤ</span>
          </div>
        )}
      </div>

      {view === "prio" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">أفق التنبؤ:</span>
          <button onClick={() => setHorizon("14")} className={btn(horizon === "14")}>أسبوعان</button>
          <button onClick={() => setHorizon("30")} className={btn(horizon === "30")}>شهر</button>
          {predictionPending && <span className="text-xs text-muted-foreground">جارٍ حساب التنبؤ…</span>}
        </div>
      )}

      <div
        style={{
          height,
          position: "relative",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <MapContainer className="oman-offline-map" bounds={MAP_BOUNDS} maxBounds={MAP_BOUNDS.pad(0.15)} maxBoundsViscosity={1} zoomSnap={0.25} zoomDelta={0.5} maxZoom={16} scrollWheelZoom={false} preferCanvas style={{ height: "100%", width: "100%" }}>
          <OfflineBasemap onStreets={setStreetLabels} />
          <MapViewport />
          <PlaceSearch />
          <ScaleControl position="bottomleft" imperial={false} />
          <GeographicLabels streets={streetLabels} />
          {view === "prio" && prioGrid.map((cell) => (
            <Rectangle key={cell.prioid} bounds={[[cell.bounds.south, cell.bounds.west], [cell.bounds.north, cell.bounds.east]]} pathOptions={{ color: cell.isPeak ? "#b45309" : cell.color, weight: cell.isPeak ? 2 : 0.5, fillColor: cell.color, fillOpacity: cell.isPeak ? 0.65 : cell.isPredictionArea ? 0.1 + 0.4 * cell.forecastIntensity : 0.1 + 0.3 * cell.baseRisk }}>
              <Popup><div dir="rtl"><strong>{cell.governorate || "منطقة غير محددة"}</strong>{cell.isPeak && " - ذروة التنبؤ"}<br />الحوادث السابقة: {cell.count} ({(cell.baseRisk * 100).toFixed(0)}% من أعلى خلية)<br />المعتقلون: {cell.detained}<br />{cell.isPredictionArea ? `حصة متوقعة من حوادث النافذة: ${(cell.forecastShare * 100).toFixed(1)}% (توزيع حصة المحافظة حسب النشاط السابق)` : "اللون يعكس النشاط السابق فقط، لا تنبؤاً"}</div></Popup>
            </Rectangle>
          ))}
          {view === "sectors" && sectors.map((sector) => (
            <GeoJSON key={sector.id} data={sector.feature} style={{ color: BORDER_COLORS[sector.id], weight: sector.id === "coast" ? 1.5 : 3, opacity: 0.95, fill: false }}>
              <Tooltip>{sector.name}</Tooltip>
              <Popup><div dir="rtl"><strong>{sector.name}</strong><br />الحوادث ضمن {BORDER_DISTANCE_KM} كم: {sector.count}<br />المعتقلون: {sector.detained}<br />{Object.entries(sector.types).map(([type, count]) => <div key={type}>{type}: {count}</div>)}<br />المصدر: OpenStreetMap - حدود مرجعية</div></Popup>
            </GeoJSON>
          ))}
          {view === "points" && <IncidentPoints incidents={shown} />}
          {view === "prio" && activePrediction && predCoords && (
            <CircleMarker center={[Number(predCoords.lat), Number(predCoords.lon)]} radius={9} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#ea580c", fillOpacity: 1 }}>
              <Tooltip>التنبؤ: {activePrediction.where.governorate}</Tooltip>
              <Popup><div dir="rtl"><strong>التنبؤ: الحدث القادم</strong><br />{activePrediction.where.governorate}<br />{activePrediction.forecastWindow.startLabel} - {activePrediction.forecastWindow.endLabel}<br />الحوادث المتوقعة: {activePrediction.when.totalExpectedIncidents.toFixed(1)}<br />المعتقلون المتوقعون: {activePrediction.howMany.expectedTotalDetained.toFixed(1)}</div></Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {view === "points" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {pointTypeCounts["تهريب"] > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: typeColor("تهريب") }} />تهريب ({pointTypeCounts["تهريب"]})</span>}
          {pointTypeCounts["تسلل"] > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: typeColor("تسلل") }} />تسلل ({pointTypeCounts["تسلل"]})</span>}
          {shown.length > (pointTypeCounts["تهريب"] || 0) + (pointTypeCounts["تسلل"] || 0) && <span>أنواع أخرى ({shown.length - (pointTypeCounts["تهريب"] || 0) - (pointTypeCounts["تسلل"] || 0)})</span>}
          <span>المواقع المعروضة: {shown.length} من أصل {incidents?.length || 0} سجل</span>
        </div>
      )}

      {view === "prio" && prioGrid.length > 0 && activePrediction && (
        <p className="text-xs text-muted-foreground">
          تُرسم فقط الخلايا (0.5°) التي سجلت حوادث سابقة: {prioGrid.length} خلية. الخلايا الحمراء تعكس النشاط السابق فقط. الخلايا البرتقالية تقع في المحافظة المتوقعة ({activePrediction.where.governorate}) وتتدرج شدتها حسب حصتها المتوقعة، والخلية المؤطرة هي ذروة التنبؤ. أفق التنبؤ: {horizon === "14" ? "أسبوعان" : "شهر"} ({activePrediction.forecastWindow.startLabel} ← {activePrediction.forecastWindow.endLabel}) — {activePrediction.when.totalExpectedIncidents.toFixed(1)} حادث متوقع، {activePrediction.howMany.expectedTotalDetained.toFixed(1)} معتقل.
        </p>
      )}
      {view === "sectors" && sectors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sectors.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-lg font-bold">{s.count}</div>
              <div className="text-xs text-muted-foreground">ضمن {BORDER_DISTANCE_KM} كم من أقرب خط حدودي</div>
            </div>
          ))}
        </div>
      )}
      {view === "sectors" && <div className="text-xs text-muted-foreground">خارج نطاق {BORDER_DISTANCE_KM} كم: {shown.length - sectors.reduce((total, sector) => total + sector.count, 0)} حادث. المصدر: OpenStreetMap - حدود مرجعية.</div>}
    </div>
  );
}