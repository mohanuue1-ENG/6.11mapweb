import React, { useEffect, useMemo, useRef } from 'react';
import { geoOrthographic, geoPath, geoGraticule, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

const SIZE = 760;
const WORLD_SCALE = 300;
const land = feature(landTopo, landTopo.objects.land);
const graticule = geoGraticule().step([10, 10])();
const sphere = { type: 'Sphere' };
const COLORS = { moving: '#22C55E', stopped: '#EF9F27', offline: '#94A3B8' };
const colorOf = (t) => COLORS[t.trackingStatus] || COLORS.offline;

// The Live Tracking globe. With no truck chosen it turns slowly and shows every truck. Click a truck (on the
// globe or in the list): the globe turns and zooms to it, and draws the line of its trip from the start
// to where it is now. Drag to turn the globe.
export default function FleetGlobe({ trucks = [], selectedId = null, route = [], onSelect, height = '640px' }) {
  const canvasRef = useRef(null);
  const state = useRef({ rotation: [100, -20, 0], scale: WORLD_SCALE, target: null, drag: null, pulse: 0 });
  const located = useMemo(() => trucks.filter((t) => Number.isFinite(t.currentLat) && Number.isFinite(t.currentLng)), [trucks]);
  const live = useRef({ located, selectedId, route: [], onSelect });
  const coords = useMemo(
    () => route.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => [p.longitude, p.latitude]),
    [route],
  );
  live.current = { located, selectedId, route: coords, onSelect };

  // Turn and zoom to the chosen truck (and its trip), or back out to the whole planet.
  useEffect(() => {
    const s = state.current;
    const truck = located.find((t) => t.id === selectedId);
    if (!truck) {
      s.target = { rotation: [s.rotation[0], -20, 0], scale: WORLD_SCALE };
      return;
    }
    const pts = coords.length > 1 ? coords : [[truck.currentLng, truck.currentLat]];
    const lons = pts.map((c) => c[0]);
    const lats = pts.map((c) => c[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const span = Math.max(geoDistance([Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]), 0.0008);
    s.target = { rotation: [-cx, -cy, 0], scale: Math.max(600, Math.min(3500, (SIZE * 0.3) / span)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, coords.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const proj = geoOrthographic().translate([SIZE / 2, SIZE / 2]).clipAngle(90);
    const path = geoPath(proj, ctx);
    const s = state.current;
    let raf = 0;

    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
    };
    const down = (e) => {
      s.drag = { x: e.clientX, y: e.clientY, moved: false };
      s.target = null;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!s.drag) return;
      const dx = e.clientX - s.drag.x;
      const dy = e.clientY - s.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) s.drag.moved = true;
      const k = ((0.4 * SIZE) / canvas.getBoundingClientRect().width) * (WORLD_SCALE / s.scale);
      s.rotation = [s.rotation[0] + dx * k, Math.max(-85, Math.min(85, s.rotation[1] - dy * k)), 0];
      s.drag.x = e.clientX;
      s.drag.y = e.clientY;
    };
    const up = (e) => {
      const d = s.drag;
      s.drag = null;
      if (!d || d.moved) return;
      // A press without movement: did it land on a truck?
      const [px, py] = toCanvas(e);
      const centre = [-s.rotation[0], -s.rotation[1]];
      let hit = null;
      let best = 22;
      live.current.located.forEach((t) => {
        const ll = [t.currentLng, t.currentLat];
        if (geoDistance(ll, centre) >= 1.5) return;
        const p = proj(ll);
        const dist = Math.hypot(p[0] - px, p[1] - py);
        if (dist < best) {
          best = dist;
          hit = t;
        }
      });
      if (hit) live.current.onSelect?.(hit);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => {
      s.drag = null;
    });

    const frame = () => {
      const { located: list, selectedId: sel, route: line } = live.current;
      if (s.target) {
        s.rotation = s.rotation.map((v, i) => v + (s.target.rotation[i] - v) * 0.08);
        s.scale += (s.target.scale - s.scale) * 0.08;
        if (Math.abs(s.scale - s.target.scale) < 0.5 && Math.abs(s.rotation[0] - s.target.rotation[0]) < 0.001) s.target = null;
      } else if (!s.drag && !sel) {
        s.rotation = [s.rotation[0] + 0.04, s.rotation[1], 0];
      }
      proj.rotate(s.rotation).scale(s.scale);
      s.pulse = (s.pulse + 0.02) % 1;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = '#10233f';
      ctx.fill();
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      path(land);
      ctx.fillStyle = '#2f6f4f';
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      path(sphere);
      ctx.strokeStyle = 'rgba(96,165,250,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const centre = [-s.rotation[0], -s.rotation[1]];
      // The trip line of the chosen truck, from the start to now.
      if (sel && line.length > 1) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: line });
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 9;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        path({ type: 'LineString', coordinates: line });
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 5;
        ctx.stroke();
        const start = proj(line[0]);
        if (start && geoDistance(line[0], centre) < 1.5) {
          ctx.beginPath();
          ctx.arc(start[0], start[1], 13, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(start[0], start[1], 9, 0, Math.PI * 2);
          ctx.fillStyle = '#22C55E';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '600 20px sans-serif';
          ctx.fillText('Start', start[0] + 18, start[1] + 7);
        }
      }

      list.forEach((t) => {
        const ll = [t.currentLng, t.currentLat];
        if (geoDistance(ll, centre) >= 1.5) return;
        const p = proj(ll);
        const on = t.id === sel;
        if (sel && !on && s.scale > 500) return; // zoomed in: only the chosen truck
        if (on) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], 12 + s.pulse * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(59,130,246,${1 - s.pulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p[0], p[1], on ? 11 : 7, 0, Math.PI * 2);
        ctx.fillStyle = on ? '#3B82F6' : colorOf(t);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = on ? 3 : 2;
        ctx.stroke();
        if (on || s.scale < 500) {
          ctx.fillStyle = '#fff';
          ctx.font = '600 18px sans-serif';
          ctx.fillText(`#${t.truckNumber}`, p[0] + 14, p[1] - 10);
        }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <div className="rounded-3xl bg-[#0B1220] flex items-center justify-center overflow-hidden relative" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="cursor-grab active:cursor-grabbing"
        style={{ height: '100%', maxWidth: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}
        aria-label="Globe with the live trucks. Press a truck to see its trip. Drag to turn the globe."
      />
    </div>
  );
}
