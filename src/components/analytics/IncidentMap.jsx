import React, { useEffect, useMemo, useRef } from "react";
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

export default function IncidentMap({ incidents, prediction, height = 420 }) {
  const hasData = incidents && incidents.length > 0;
  const shown = hasData ? incidents.slice(0, 400) : [];
  const viewerRef = useRef(null);

  // Set the initial camera view over Oman once the viewer mounts.
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(OMAN.lon, OMAN.lat, OMAN.height),
      });
    }
  }, []);

  const predCoords = useMemo(() => {
    if (!prediction) return null;
    const g = prediction.where.governorate;
    const rec = incidents.find((i) => i.governorate === g);
    return rec ? { lon: rec.longitude, lat: rec.latitude } : null;
  }, [prediction, incidents]);

  return (
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
        {shown.map((inc, idx) => (
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
  );
}