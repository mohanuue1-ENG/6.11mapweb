import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { dateTime } from '../../services/format';

const STREET = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK = 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

// Draws a recorded route: green start, red end, and a slider that moves a marker
// along it. route = [{ latitude, longitude, gpsTimestamp? }], oldest first.
export default function RouteReplayMap({ route = [], height = '420px' }) {
  const { isDark } = useTheme();
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const layerRef = useRef(null);
  const cursorRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const map = L.map(elRef.current).setView([39.5, -98.35], 4);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(isDark ? DARK : STREET, { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  }, [isDark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current.clearLayers();
    cursorRef.current = null;
    setIndex(0);
    if (!route.length) return;

    const pts = route.map((p) => [p.latitude, p.longitude]);
    const dot = (latlng, color, radius, tip) => {
      const m = L.circleMarker(latlng, { radius, color: '#FFFFFF', weight: 2, fillColor: color, fillOpacity: 1 });
      if (tip) m.bindTooltip(tip);
      return m.addTo(layerRef.current);
    };
    L.polyline(pts, { color: '#22C55E', weight: 4, opacity: 0.9 }).addTo(layerRef.current);
    dot(pts[0], '#22C55E', 8, 'Start');
    if (pts.length > 1) dot(pts[pts.length - 1], '#EF4444', 8, 'End');
    cursorRef.current = dot(pts[0], '#3B82F6', 6);
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
  }, [route]);

  useEffect(() => {
    if (cursorRef.current && route[index]) cursorRef.current.setLatLng([route[index].latitude, route[index].longitude]);
  }, [index, route]);

  const current = route[index];
  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height }}>
        <div ref={elRef} className="w-full h-full" />
      </div>
      {route.length === 0 && <p className="text-xs text-gray-400 text-center">No GPS points were recorded for this selection.</p>}
      {route.length > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <input
            type="range"
            min={0}
            max={route.length - 1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Replay position"
            className="flex-1 accent-brand-green"
          />
          <span className="font-numbers text-gray-400 w-44 text-right">{current?.gpsTimestamp ? dateTime(current.gpsTimestamp) : `${index + 1} / ${route.length}`}</span>
        </div>
      )}
    </div>
  );
}
