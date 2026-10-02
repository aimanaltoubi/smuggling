import React from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Oman center
const OMAN_CENTER = [21.5, 56.0];

export default function IncidentMap({ incidents, prediction, height = 420 }) {
  const hasData = incidents && incidents.length > 0;
  // Sample incidents if too many for performance
  const shown = hasData ? incidents.slice(0, 400) : [];

  const typeColor = { "تهريب": "#dc2626", "تسلل": "#2563eb" };

  // Prediction marker icon
  const predIcon = prediction
    ? L.divIcon({
        className: "prediction-marker",
        html: `<div style="width:18px;height:18px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(245,158,11,0.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
    : null;

  // Find coordinates for predicted governorate (use first incident in that governorate)
  const predCoords = prediction
    ? (() => {
        const g = prediction.where.governorate;
        const rec = incidents.find((i) => i.governorate === g);
        return rec ? [rec.latitude, rec.longitude] : null;
      })()
    : null;

  return (
    <div style={{ height, borderRadius: 12, overflow: "hidden", border: "1px solid hsl(var(--border))" }}>
      <MapContainer center={OMAN_CENTER} zoom={6} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {shown.map((inc, idx) => (
          <CircleMarker
            key={idx}
            center={[inc.latitude, inc.longitude]}
            radius={4 + Math.min(6, (inc.detained_count || 1) / 2)}
            pathOptions={{ color: typeColor[inc.incident_type] || "#666", fillColor: typeColor[inc.incident_type] || "#666", fillOpacity: 0.6 }}
          >
            <Popup>
              <div style={{ direction: "rtl", textAlign: "right" }}>
                <strong>{inc.incident_type}</strong><br />
                {inc.location_name} - {inc.governorate}<br />
                التاريخ: {inc.incident_date}<br />
                المعتقلون: {inc.detained_count}
              </div>
            </Popup>
          </CircleMarker>
        ))}
        {prediction && predCoords && predIcon && (
          <Marker position={predCoords} icon={predIcon}>
            <Popup>
              <div style={{ direction: "rtl", textAlign: "right" }}>
                <strong>التنبؤ: الحدث القادم</strong><br />
                المحافظة: {prediction.where.governorate}<br />
                الفترة: {prediction.forecastWindow.startLabel} ← {prediction.forecastWindow.endLabel}<br />
                الحوادث المتوقعة: {prediction.when.totalExpectedIncidents}<br />
                المعتقلون المتوقعون: {prediction.howMany.expectedTotalDetained}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}