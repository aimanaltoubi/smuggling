import pointToLineDistance from "@turf/point-to-line-distance";

export const BORDER_DISTANCE_KM = 25;

export function buildBorderStatistics(incidents, features, maximumDistance = BORDER_DISTANCE_KM) {
  const statistics = features.map(feature => ({ ...feature.properties, feature, count: 0, detained: 0, types: {} }));
  const lines = features.flatMap((feature, index) => feature.geometry.coordinates.map(coordinates => ({
    index,
    geometry: { type: "LineString", coordinates },
    bounds: coordinates.reduce((bounds, coordinate) => [
      Math.min(bounds[0], coordinate[0]), Math.min(bounds[1], coordinate[1]),
      Math.max(bounds[2], coordinate[0]), Math.max(bounds[3], coordinate[1]),
    ], [Infinity, Infinity, -Infinity, -Infinity]),
  })));
  const cache = new Map();
  for (const incident of incidents) {
    if (incident.latitude == null || incident.longitude == null) continue;
    const latitude = Number(incident.latitude);
    const longitude = Number(incident.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const key = `${latitude},${longitude}`;
    if (!cache.has(key)) {
      let closestIndex = -1;
      let closestDistance = maximumDistance;
      const latitudePadding = maximumDistance / 100;
      const longitudePadding = latitudePadding / Math.max(0.01, Math.cos(latitude * Math.PI / 180));
      for (const line of lines) {
        if (longitude < line.bounds[0] - longitudePadding || longitude > line.bounds[2] + longitudePadding
          || latitude < line.bounds[1] - latitudePadding || latitude > line.bounds[3] + latitudePadding) continue;
        const distance = pointToLineDistance([longitude, latitude], line.geometry, { units: "kilometers", method: "geodesic" });
        if (distance <= closestDistance) {
          closestDistance = distance;
          closestIndex = line.index;
        }
      }
      cache.set(key, closestIndex);
    }
    const index = cache.get(key);
    if (index === -1) continue;
    const statistic = statistics[index];
    statistic.count += 1;
    statistic.detained += Number(incident.detained_count) || 0;
    statistic.types[incident.incident_type] = (statistic.types[incident.incident_type] || 0) + 1;
  }
  return statistics;
}