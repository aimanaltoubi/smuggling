import { writeFile } from "node:fs/promises";
import path from "node:path";
import osmtogeojson from "osmtogeojson";

const BOUNDS = { west: 51.9, south: 16.5, east: 60, north: 26.6 };
const WIDTH = 900;
const HEIGHT = 1200;
const BBOX = `${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east}`;
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const NATURAL_EARTH_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson";
const COUNTRY_NAMES = ["Oman", "Saudi Arabia", "United Arab Emirates", "Yemen", "Iran", "Qatar"];
const MAP_QUERY = `[out:json][timeout:120];(
way["highway"~"^(motorway|trunk|primary)$"](${BBOX});
way["natural"="coastline"](${BBOX});
way["boundary"="administrative"]["admin_level"="4"](${BBOX});
node["place"~"^(city|town)$"](${BBOX});
);out geom;`;
const PLACE_TYPES = ["city", "town", "village", "hamlet", "suburb", "neighbourhood"];
const PLACES_QUERY = `[out:json][timeout:120];area["ISO3166-1"="OM"]["admin_level"="2"]->.oman;node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"](area.oman);out body;`;
const BOUNDARIES_QUERY = `[out:json][timeout:120];rel["boundary"="administrative"]["admin_level"="2"]["ISO3166-1"~"^(OM|AE|SA|YE)$"]->.countries;.countries out body;way(r.countries);out geom;`;
const GEOGRAPHY_QUERY = `[out:json][timeout:120];area["ISO3166-1"="OM"]["admin_level"="2"]->.oman;(
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)$"](area.oman);
way["waterway"~"^(river|stream|wadi|canal)$"](area.oman);
way["natural"~"^(water|wood|scrub|wetland)$"](area.oman);
way["landuse"~"^(residential|industrial|commercial|retail|forest|farmland|orchard)$"](area.oman);
relation["natural"="water"](area.oman);
);out geom;`;

async function writeGeography() {
  const result = await fetchOverpass(GEOGRAPHY_QUERY);
  const converted = osmtogeojson(result, { flatProperties: true });
  const features = converted.features
    .filter(feature => ["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(feature.geometry?.type))
    .map(feature => {
      const tags = feature.properties;
      const kind = tags.highway ? "road" : tags.waterway ? "waterway"
        : ["water", "wetland"].includes(tags.natural) ? "water"
          : ["residential", "industrial", "commercial", "retail"].includes(tags.landuse) ? "urban" : "vegetation";
      const properties = { id: feature.id, kind, roadClass: tags.highway || "", name: tags["name:ar"] || tags.name || "" };
      if (kind === "road" && properties.name && feature.geometry.type === "LineString") {
        const midpoint = feature.geometry.coordinates[Math.floor(feature.geometry.coordinates.length / 2)];
        properties.labelLon = midpoint[0];
        properties.labelLat = midpoint[1];
      }
      return { type: "Feature", properties, geometry: feature.geometry };
    });
  const roads = features.filter(feature => feature.properties.kind === "road").length;
  const urban = features.filter(feature => feature.properties.kind === "urban").length;
  if (roads < 2000 || urban < 10) throw new Error(`Oman geography looks incomplete (${roads} roads, ${urban} urban areas).`);
  const response = await fetch(NATURAL_EARTH_URL, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Country outline download failed: HTTP ${response.status}`);
  const countries = await response.json();
  const outlines = countries.features.filter(feature => COUNTRY_NAMES.includes(feature.properties?.ADMIN)).map(feature => ({
    type: "Feature", properties: { kind: "country", name: feature.properties.ADMIN }, geometry: feature.geometry,
  }));
  if (outlines.length !== COUNTRY_NAMES.length) throw new Error("Country outlines are incomplete.");
  const output = path.resolve("public/offline-oman-geography.json");
  await writeFile(output, JSON.stringify({ type: "FeatureCollection", source: "OpenStreetMap contributors and Natural Earth", license: "ODbL 1.0 and public domain", timestamp: result.osm3s?.timestamp_osm_base || "unknown", features: [...outlines, ...features] }) + "\n");
  console.log(`Wrote ${output} (${roads} roads, ${urban} urban areas, ${features.length} detail features).`);
}

async function writeBoundaries() {
  const result = await fetchOverpass(BOUNDARIES_QUERY);
  const relations = (result.elements || []).filter(element => element.type === "relation");
  const oman = relations.find(relation => relation.tags?.["ISO3166-1"] === "OM");
  if (!oman) throw new Error("Oman national boundary relation is missing.");
  const ways = new Map((result.elements || []).filter(element => element.type === "way").map(way => [way.id, way]));
  const coastResult = await fetchOverpass(`[out:json][timeout:120];area["ISO3166-1"="OM"]["admin_level"="2"]->.oman;way["natural"="coastline"](area.oman);out geom;`);
  const groups = [
    { id: "uae", name: "حدود الإمارات", code: "AE" },
    { id: "saudi", name: "حدود السعودية", code: "SA" },
    { id: "yemen", name: "حدود اليمن", code: "YE" },
    { id: "coast", name: "الساحل", code: null },
  ];
  const features = groups.map(group => {
    const neighbour = relations.find(relation => relation.tags?.["ISO3166-1"] === group.code);
    if (group.code && !neighbour) throw new Error(`Missing national boundary relation: ${group.code}`);
    const sharedIds = new Set((neighbour?.members || []).filter(member => member.type === "way").map(member => member.ref));
    const sourceWays = group.code
      ? oman.members.filter(member => member.type === "way" && sharedIds.has(member.ref)).map(member => ways.get(member.ref))
      : (coastResult.elements || []).filter(way => way.type === "way" && way.tags?.natural === "coastline");
    const coordinates = sourceWays
      .filter(way => way?.geometry?.length > 1 && way.tags?.maritime !== "yes" && way.tags?.boundary !== "maritime")
      .map(way => way.geometry.map(point => [point.lon, point.lat]));
    if (!coordinates.length) throw new Error(`No geographic lines found for ${group.id}`);
    return { type: "Feature", properties: { id: group.id, name: group.name }, geometry: { type: "MultiLineString", coordinates } };
  });
  const output = path.resolve("src/lib/analytics/omanBoundaries.json");
  await writeFile(output, JSON.stringify({ type: "FeatureCollection", source: "OpenStreetMap contributors", license: "ODbL 1.0", timestamp: result.osm3s?.timestamp_osm_base || "unknown", features }) + "\n");
  console.log(`Wrote ${output} (${features.map(feature => `${feature.properties.id}: ${feature.geometry.coordinates.length} lines`).join(", ")}).`);
}

async function fetchOverpass(query, timeout = 180000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(ENDPOINTS[attempt], {
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
    if (attempt === 2) break;
    console.warn(`OpenStreetMap is busy; retrying with another endpoint (${attempt + 1}/2).`);
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

if (process.argv.includes("--boundaries-only")) {
  await writeBoundaries();
  process.exit(0);
}
if (process.argv.includes("--geography-only")) {
  await writeGeography();
  process.exit(0);
}

const placesResult = await fetchOverpass(PLACES_QUERY);
const places = (placesResult.elements || [])
  .filter(place => place.type === "node" && PLACE_TYPES.includes(place.tags?.place)
    && (place.tags["name:ar"] || place.tags.name)
    && Number.isFinite(place.lat) && Number.isFinite(place.lon)
    && place.lat >= BOUNDS.south && place.lat <= BOUNDS.north
    && place.lon >= BOUNDS.west && place.lon <= BOUNDS.east)
  .map(place => ({
    id: `osm-${place.id}`,
    name: place.tags["name:ar"] || place.tags.name,
    englishName: place.tags["name:en"] || "",
    kind: place.tags.place,
    lat: place.lat,
    lon: place.lon,
    population: Number(String(place.tags.population || "0").replaceAll(",", "")) || 0,
  }))
  .sort((first, second) => PLACE_TYPES.indexOf(first.kind) - PLACE_TYPES.indexOf(second.kind)
    || second.population - first.population || first.name.localeCompare(second.name, "ar"));
if (places.length < 100 || !places.some(place => place.kind === "city")) {
  throw new Error(`Oman place data looks incomplete (${places.length} named places).`);
}
const placesPath = path.resolve("src/lib/analytics/omanPlaces.json");
await writeFile(placesPath, JSON.stringify({
  source: "OpenStreetMap contributors",
  license: "ODbL 1.0",
  timestamp: placesResult.osm3s?.timestamp_osm_base || "unknown",
  places,
}, null, 2) + "\n", "utf8");
console.log(`Wrote ${placesPath} (${places.length} named Oman places).`);
if (process.argv.includes("--places-only")) process.exit(0);
await writeBoundaries();
await writeGeography();

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
  <text x="16" y="${HEIGHT - 28}" fill="#52666a" font-family="sans-serif" font-size="12">Country outlines: Natural Earth, public domain</text>
  <text x="16" y="${HEIGHT - 12}" fill="#52666a" font-family="sans-serif" font-size="12">Roads, coastline, governorate boundaries, and places: &#169; OpenStreetMap contributors · ODbL 1.0 · Data: ${timestamp}</text>
</svg>`;

const outputPath = path.resolve("public/offline-oman-map.svg");
await writeFile(outputPath, svg, "utf8");
console.log(`Wrote ${outputPath} (${Buffer.byteLength(svg)} bytes; ${roads.length} roads, ${governorateBoundaries.length} boundary segments, ${countries.length} countries, ${settlements.length} settlements).`);