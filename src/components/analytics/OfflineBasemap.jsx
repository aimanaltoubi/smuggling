import React, { useEffect, useState } from "react";
import Leaflet from "leaflet";
import { useMap } from "react-leaflet";
import { Loader2, RotateCw } from "lucide-react";

let geographyPromise;

function loadGeography() {
  geographyPromise ??= fetch(new URL(`${import.meta.env.BASE_URL}offline-oman-geography.json`, window.location.href))
    .then(response => {
      if (!response.ok) throw new Error("Local map data is unavailable");
      return response.json();
    })
    .catch(error => {
      geographyPromise = undefined;
      throw error;
    });
  return geographyPromise;
}

function geographyStyle(properties, zoom) {
  if (properties.kind === "country") return { color: properties.name === "Oman" ? "#7d8b78" : "#b4beb0", weight: 0.7, fill: true, fillColor: "#f3f5ee", fillOpacity: 1 };
  if (properties.kind === "urban") return { stroke: false, fill: true, fillColor: "#d8ded6", fillOpacity: 0.75 };
  if (properties.kind === "vegetation") return { stroke: false, fill: true, fillColor: "#d0e2c3", fillOpacity: 0.65 };
  if (properties.kind === "water") return { color: "#8db9c7", weight: 0.5, fill: true, fillColor: "#bddde6", fillOpacity: 1 };
  if (properties.kind === "waterway") return zoom < 9 ? [] : { color: "#8eb9c5", weight: zoom < 12 ? 0.6 : 1.2, opacity: 0.8 };
  if (properties.kind === "road") {
    const minimumZoom = { motorway: 0, trunk: 0, primary: 7, secondary: 8, tertiary: 10, unclassified: 11, residential: 12, living_street: 13, service: 14 };
    if (zoom < minimumZoom[properties.roadClass]) return [];
    const major = ["motorway", "trunk", "primary"].includes(properties.roadClass);
    const width = major ? (zoom < 10 ? 1.1 : zoom < 13 ? 2.2 : 3) : (zoom < 12 ? 0.8 : 1.5);
    return [
      { color: major ? "#b5a17b" : "#bec6bc", weight: width + 1.2, opacity: 0.8, lineCap: "round" },
      { color: major ? "#f4d995" : "#ffffff", weight: width, opacity: 1, lineCap: "round" },
    ];
  }
  return [];
}

export default function OfflineBasemap({ onStreets }) {
  const map = useMap();
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let layer;
    setStatus("loading");
    window.L = Leaflet;
    Promise.all([loadGeography(), import("leaflet.vectorgrid")]).then(([data]) => {
      if (cancelled) return;
      if (!data.features?.length) throw new Error("Local map data is empty");
      onStreets(data.features.filter(feature => feature.properties.kind === "road" && feature.properties.name && Number.isFinite(feature.properties.labelLat))
        .map(feature => ({ id: feature.properties.id, name: feature.properties.name, lat: feature.properties.labelLat, lon: feature.properties.labelLon, coordinates: feature.geometry.coordinates, kind: "street" })));
      layer = Leaflet.vectorGrid.slicer(data, {
        rendererFactory: Leaflet.canvas.tile,
        vectorTileLayerStyles: { sliced: geographyStyle },
        pane: "tilePane",
        maxNativeZoom: 14,
        maxZoom: 16,
        attribution: 'Natural Earth · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ODbL',
      });
      layer.once("load", () => { if (!cancelled) setStatus("ready"); });
      layer.on("tileerror", () => { if (!cancelled) setStatus("error"); });
      layer.addTo(map);
    }).catch(error => {
      if (!cancelled) {
        console.error("Offline map could not load", error);
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
      if (layer) {
        layer.remove();
        layer._worker?.terminate();
      }
    };
  }, [map, onStreets, attempt]);
  if (status === "ready") return null;
  return <div className="oman-map-status" role={status === "error" ? "alert" : "status"}>
    {status === "loading" ? <><Loader2 className="animate-spin" size={20} /> جار تحميل الخريطة المحلية</> : <>تعذر تحميل الخريطة المحلية <button type="button" title="إعادة المحاولة" aria-label="إعادة المحاولة" onClick={() => setAttempt(attempt + 1)}><RotateCw size={18} /></button></>}
  </div>;
}