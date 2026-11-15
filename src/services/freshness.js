// How old a GPS fix may be before the dashboard stops treating it as live.
// These are starting values: the PRD leaves GPS upload intervals to be agreed,
// and the thresholds should follow them (a few upload intervals each).
export const STALE_AFTER_MS = 2 * 60 * 1000;
export const OFFLINE_AFTER_MS = 15 * 60 * 1000;

const MPS_TO_MPH = 2.23694;
const MOVING_FROM_MPH = 2;

// 'current' | 'stale' | 'offline' for a fix taken at `gpsTimestamp`; 'none' without a fix.
export function freshnessOf(gpsTimestamp, now = Date.now()) {
  if (!gpsTimestamp) return 'none';
  const age = now - Date.parse(gpsTimestamp);
  if (age > OFFLINE_AFTER_MS) return 'offline';
  if (age > STALE_AFTER_MS) return 'stale';
  return 'current';
}

// Adds the latest known position to a truck row. A truck is only "moving" or
// "stopped" while its fix is recent enough to say so; otherwise it is offline
// and keeps its last known position.
export function withLocation(truck, location, now = Date.now()) {
  if (!location) return { ...truck, freshness: 'none' };
  const freshness = freshnessOf(location.gpsTimestamp, now);
  const speed = Math.round((location.speedMps ?? 0) * MPS_TO_MPH);
  return {
    ...truck,
    freshness,
    currentLat: location.latitude,
    currentLng: location.longitude,
    currentAddress: `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
    speed,
    heading: Math.round(location.headingDegrees ?? 0),
    lastUpdate: location.gpsTimestamp,
    trackingStatus: freshness === 'offline' ? 'offline' : speed >= MOVING_FROM_MPH ? 'moving' : 'stopped',
  };
}

// "just now", "3 min ago", "2 h ago", "4 d ago"
export function formatAge(gpsTimestamp, now = Date.now()) {
  if (!gpsTimestamp) return 'no GPS yet';
  const seconds = Math.max(0, Math.round((now - Date.parse(gpsTimestamp)) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}
