import React, { useEffect, useMemo, useRef } from 'react';
import { drawGlobe } from './globeStyle';
import { useTheme } from '../../context/ThemeContext';
import { geoOrthographic, geoPath, geoGraticule, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

const SIZE = 700;
const land = feature(landTopo, landTopo.objects.land);
const graticule = geoGraticule().step([2, 2])();
const sphere = { type: 'Sphere' };

// A globe that zooms to a stored route: the line the truck drove, with the start (green) and the end (red).
// `route` is a list of { latitude, longitude } in driving order. Drag to turn the globe.
export default function RouteGlobe({ route = [], height = '420px' }) {
  const canvasRef = useRef(null);
  const { isDark } = useTheme();
  const nightRef = useRef(isDark);
  nightRef.current = isDark;
  const state = useRef({ rotation: [100, -20, 0], scale: 260, target: null, drag: null, pulse: 0 });
  const coords = useMemo(
    () => route.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => [p.longitude, p.latitude]),
    [route],
  );
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  // Fit the globe to the route whenever a new route arrives.
  useEffect(() => {
    if (!coords.length) {
      state.current.target = { rotation: [state.current.rotation[0], -20, 0], scale: 260 };
      return;
    }
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const span = Math.max(geoDistance([Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]), 0.0008);
    // A short route zooms in, a long one shows more of the planet. The zoom stops at country level: the
    // roads of a short trip are on the street map.
    const scale = Math.max(260, Math.min(900, (SIZE * 0.32) / span));
    state.current.target = { rotation: [-cx, -cy, 0], scale };
  }, [coords]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const proj = geoOrthographic().translate([SIZE / 2, SIZE / 2]).clipAngle(90);
    const path = geoPath(proj, ctx);
    const s = state.current;
    let raf = 0;

    const down = (e) => {
      s.drag = { x: e.clientX, y: e.clientY };
      s.target = null;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!s.drag) return;
      const k = (0.4 * SIZE) / canvas.getBoundingClientRect().width * (260 / s.scale);
      s.rotation = [s.rotation[0] + (e.clientX - s.drag.x) * k, Math.max(-85, Math.min(85, s.rotation[1] - (e.clientY - s.drag.y) * k)), 0];
      s.drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      s.drag = null;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const frame = () => {
      if (s.target) {
        // Ease toward the target view.
        s.rotation = s.rotation.map((v, i) => v + (s.target.rotation[i] - v) * 0.08);
        s.scale += (s.target.scale - s.scale) * 0.08;
        if (Math.abs(s.scale - s.target.scale) < 0.5 && Math.abs(s.rotation[0] - s.target.rotation[0]) < 0.001) s.target = null;
      } else if (!s.drag && !coordsRef.current.length) {
        s.rotation = [s.rotation[0] + 0.05, s.rotation[1], 0];
      }
      proj.rotate(s.rotation).scale(s.scale);
      s.pulse = (s.pulse + 0.02) % 1;

      drawGlobe(ctx, proj, { size: SIZE, night: nightRef.current, land, graticule, sphere });

      const pts = coordsRef.current;
      if (pts.length > 1) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: pts });
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        path({ type: 'LineString', coordinates: pts });
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      if (pts.length) {
        const mark = (ll, color, label) => {
          const p = proj(ll);
          if (!p) return;
          ctx.beginPath();
          ctx.arc(p[0], p[1], 13, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '600 20px sans-serif';
          ctx.fillText(label, p[0] + 18, p[1] + 7);
        };
        const a = proj(pts[0]);
        const b = proj(pts[pts.length - 1]);
        const together = a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 70;
        if (!together) mark(pts[0], '#22C55E', 'Start');
        if (pts.length > 1) {
          const end = proj(pts[pts.length - 1]);
          if (end) {
            ctx.beginPath();
            ctx.arc(end[0], end[1], 12 + s.pulse * 18, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239,68,68,${1 - s.pulse})`;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          mark(pts[pts.length - 1], '#EF4444', together ? 'Start / End' : 'End');
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className="flex items-center justify-center overflow-hidden" style={{ height: `min(${height}, 100vw)` }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="cursor-grab active:cursor-grabbing"
        style={{ width: '100%', maxWidth: height, height: 'auto', aspectRatio: '1 / 1', touchAction: 'none' }}
        aria-label="Globe showing the stored route. Drag to turn it."
      />
    </div>
  );
}
