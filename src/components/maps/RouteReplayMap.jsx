import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { dateTime } from '../../services/format';
import { MAP_STYLES, tileLayerFor } from './mapStyles';
import { Play, Pause } from 'lucide-react';

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
  const [style, setStyle] = useState(isDark ? 'dark' : 'street');
  const [playing, setPlaying] = useState(false);

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
    tileRef.current = tileLayerFor(style).addTo(map);
  }, [style]);

  // Play: the marker drives along the route by itself.
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= route.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(40, Math.min(250, 8000 / Math.max(route.length, 1))));
    return () => clearInterval(id);
  }, [playing, route.length]);

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
      <div className="rounded-2xl overflow-hidden border border-white/10 relative" style={{ height }}>
        <div ref={elRef} className="w-full h-full" />
        <div className="absolute top-2 right-2 z-[1000] flex gap-0.5 rounded-xl bg-white/95 p-0.5 shadow border border-gray-200" role="group" aria-label="Map look">
          {MAP_STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setStyle(st.id)}
              aria-pressed={style === st.id}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${style === st.id ? 'bg-[#22C55E] text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>
      {route.length === 0 && <p className="text-xs text-gray-400 text-center">No GPS points were recorded for this selection.</p>}
      {route.length > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              if (index >= route.length - 1) setIndex(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? 'Pause' : 'Play the trip'}
            className="w-8 h-8 rounded-full bg-brand-green text-[#052E16] flex items-center justify-center shrink-0"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={route.length - 1}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            aria-label="Replay position"
            className="flex-1 accent-brand-green"
          />
          <span className="font-numbers text-gray-400 w-44 text-right">{current?.gpsTimestamp ? dateTime(current.gpsTimestamp) : `${index + 1} / ${route.length}`}</span>
        </div>
      )}
    </div>
  );
}
