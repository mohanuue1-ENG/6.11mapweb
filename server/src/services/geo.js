// Distance between GPS points. PRD section 14 leaves the distance method to be
// decided; this is the default: great-circle (haversine) length of the recorded
// route, after discarding unreliable points. Tune the limits below on real trips.
const EARTH_RADIUS_M = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversineMeters(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// points: [{ latitude, longitude, accuracyMeters, timeMs }] in time order.
// Returns metres, or null when there are too few usable points to say.
export function routeDistance(points, { maxAccuracyM = 100, maxSpeedMps = 55, minSegmentM = 5, minPoints = 3 } = {}) {
  // Points with poor accuracy are ignored (accuracy unknown is kept).
  const usable = points.filter((p) => p.accuracyMeters == null || p.accuracyMeters <= maxAccuracyM);
  if (usable.length < minPoints) return null;

  let total = 0;
  let prev = usable[0];
  for (let i = 1; i < usable.length; i += 1) {
    const p = usable[i];
    const seconds = (p.timeMs - prev.timeMs) / 1000;
    if (seconds <= 0) continue;
    const d = haversineMeters(prev, p);
    // Standing still: GPS jitter must not add up to fake distance.
    if (d < minSegmentM) continue;
    // A jump faster than any truck can drive is a GPS glitch: skip that leg.
    if (d / seconds <= maxSpeedMps) total += d;
    prev = p;
  }
  return Math.round(total);
}
