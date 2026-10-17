import { writeFile } from "node:fs/promises";
import path from "node:path";

const BOUNDS = { west: 51.9, south: 16.5, east: 60, north: 26.6 };
const WIDTH = 900;
const HEIGHT = 1200;
const BBOX = `${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east}`;
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const NATURAL_EARTH_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson";
const COUNTRY_NAMES = ["Oman", "Saudi Arabia", "United Arab Emirates", "Yemen", "Iran", "Qatar"];
const MAP_QUERY = `[out:json][timeout:120];(
way["highway"~"^(motorway|trunk|primary)$"](${BBOX});
way["natural"="coastline"](${BBOX});
way["boundary"="administrative"]["admin_level"="4"](${BBOX});
node["place"~"^(city|town)$"](${BBOX});
);out geom;`;

async function fetchOverpass(query, timeout = 180000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "OmanIncidentAnalytics/1.0",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) {
        const result = await response.json();
        if (!result.remark) return result;
        if (!/timeout|too many|rate limit|server/i.test(result.remark)) {
          throw new Error(`OpenStreetMap query failed: ${result.remark}`);
        }
      } else if (![429, 502, 503, 504].includes(response.status)) {
        throw new Error(`OpenStreetMap query failed: HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === 2) throw error;
      if (error.name !== "AbortError" && error.name !== "TimeoutError" && !/HTTP (429|502|503|504)/.test(error.message)) {
        throw error;
      }
    }
    console.warn(`OpenStreetMap is busy; retrying request (${attempt + 1}/2).`);
    await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 3000));
  }
  throw new Error("OpenStreetMap query failed after retries.");
}

function project(point) {
  return [
    ((point.lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west) * WIDTH).toFixed(2),
    ((BOUNDS.north - point.lat) / (BOUNDS.north - BOUNDS.south) * HEIGHT).toFixed(2),
  ];
}

function pathData(points, close = false) {
  const validPoints = points.filter(point => Number.isFinite(point.lon) && Number.isFinite(point.lat));
  if (validPoints.length < 2) return "";
  const [first, ...rest] = validPoints.map(project);
  return `M${first[0]},${first[1]}${rest.map(point => `L${point[0]},${point[1]}`).join("")}${close ? "Z" : ""}`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

const result = await fetchOverpass(MAP_QUERY);
const countryResponse = await fetch(NATURAL_EARTH_URL, { signal: AbortSignal.timeout(90000) });
if (!countryResponse.ok) throw new Error(`Natural Earth country download failed: HTTP ${countryResponse.status}`);
const countryData = await countryResponse.json();
const countries = (countryData.features || []).filter(feature => COUNTRY_NAMES.includes(feature.properties?.ADMIN));
const elements = result.elements || [];
const roads = elements.filter(element => element.type === "way" && ["motorway", "trunk", "primary"].includes(element.tags?.highway));
const coastlines = elements.filter(element => element.type === "way" && element.tags?.natural === "coastline");
const governorateBoundaries = elements.filter(element => element.type === "way" && element.tags?.boundary === "administrative" && element.tags?.admin_level === "4");
const settlements = elements.filter(element => element.type === "node" && ["city", "town"].includes(element.tags?.place)
  && (element.tags?.place === "city" || Number(element.tags?.population) >= 50000));

if (roads.length < 1000 || coastlines.length < 100 || governorateBoundaries.length < 20 || countries.length !== COUNTRY_NAMES.length || settlements.length < 5) {
  throw new Error(`OpenStreetMap data looks incomplete (roads ${roads.length}, coastlines ${coastlines.length}, boundaries ${governorateBoundaries.length}, countries ${countries.length}, settlements ${settlements.length}).`);
}

const countryPaths = countries.map(country => {
  const polygons = country.geometry?.type === "Polygon"
    ? [country.geometry.coordinates]
    : country.geometry?.coordinates || [];
  const rings = polygons.flatMap(polygon => polygon.map(ring => ring.map(([lon, lat]) => ({ lon, lat }))));
  const d = rings.map(ring => pathData(ring, true)).filter(Boolean).join("");
  if (!d) return "";
  const className = country.properties.ADMIN === "Oman" ? "country oman" : "country neighbor";
  return `<path class="${className}" fill-rule="evenodd" d="${d}"/>`;
}).filter(Boolean);

const coastlinePath = coastlines
  .map(coastline => pathData(coastline.geometry || []))
  .filter(Boolean)
  .join("");
const boundariesPath = governorateBoundaries
  .map(boundary => pathData(boundary.geometry || []))
  .filter(Boolean)
  .join("");

const roadGroups = { motorway: [], trunk: [], primary: [] };
for (const road of roads) {
  const d = pathData(road.geometry || []);
  if (d) roadGroups[road.tags.highway].push(d);
}

const roadStyles = {
  motorway: { color: "#b3453b", width: 3.4 },
  trunk: { color: "#d2753e", width: 2.7 },
  primary: { color: "#c39a43", width: 2.0 },
};
const roadPaths = Object.entries(roadGroups).map(([type, paths]) => {
  const d = paths.join("");
  if (!d) return "";
  const style = roadStyles[type];
  return `<path d="${d}" fill="none" stroke="#fffdf7" stroke-width="${style.width + 1.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}).join("");

const labels = settlements
  .filter(place => place.tags?.["name:ar"] || place.tags?.name)
  .map(place => {
    const name = escapeXml(place.tags["name:ar"] || place.tags.name);
    const [x, y] = project(place);
    return `<text class="place" x="${x}" y="${y}">${name}</text>`;
  })
  .join("");

const timestamp = escapeXml(result.osm3s?.timestamp_osm_base || "unknown");
if (countryPaths.length !== COUNTRY_NAMES.length || !countryPaths.some(country => country.includes('class="country oman"'))) {
  throw new Error("Natural Earth data did not include all required country outlines.");
}
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>Offline Oman map</title>
  <desc>Natural Earth country outlines with OpenStreetMap governorate boundaries, principal roads, and cities for offline orientation.</desc>
  <style>
    .country { stroke: #879487; stroke-width: 2; }
    .oman { fill: #c8dcc1; stroke: #496e58; stroke-width: 3; }
    .neighbor { fill: #ebe7da; }
    .governorate { fill: none; stroke: #758d78; stroke-width: 1.3; stroke-dasharray: 5 4; }
    .place { fill: #293a3c; font: 600 13px sans-serif; text-anchor: middle; paint-order: stroke; stroke: #f4f2e9; stroke-width: 3px; stroke-linejoin: round; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#d9eaf0"/>
  <g>${countryPaths.join("")}</g>
  <path d="${coastlinePath}" fill="none" stroke="#668e9b" stroke-width="1.4"/>
  <path class="governorate" d="${boundariesPath}"/>
  <g>${roadPaths}</g>
  <g>${labels}</g>
  <text x="16" y="${HEIGHT - 28}" fill="#52666a" font-family="sans-serif" font-size="12">Country outlines: Natural Earth, public domain</text>
  <text x="16" y="${HEIGHT - 12}" fill="#52666a" font-family="sans-serif" font-size="12">Roads, coastline, governorate boundaries, and places: &#169; OpenStreetMap contributors · ODbL 1.0 · Data: ${timestamp}</text>
</svg>`;

const outputPath = path.resolve("public/offline-oman-map.svg");
await writeFile(outputPath, svg, "utf8");
console.log(`Wrote ${outputPath} (${Buffer.byteLength(svg)} bytes; ${roads.length} roads, ${governorateBoundaries.length} boundary segments, ${countries.length} countries, ${settlements.length} settlements).`);