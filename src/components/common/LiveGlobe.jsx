import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { interpolate } from 'd3-interpolate';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import TruckPlace from './TruckPlace';
import { drawGlobe } from '../maps/globeStyle';
import { Radio, MapPinned } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const SIZE = 520;
const RADIUS = 252;
const CYCLE_MS = 10000;
const FLY_MS = 1800;
const land = feature(landTopo, landTopo.objects.land);
const graticule = geoGraticule10();
const sphere = { type: 'Sphere' };

const STATUS = {
  moving: { color: '#22C55E', label: 'Moving' },
  stopped: { color: '#F59E0B', label: 'Stopped' },
  offline: { color: '#94A3B8', label: 'Offline' },
};
const statusOf = (t) => STATUS[t.trackingStatus] || STATUS.offline;

// A world globe on the dashboard. Every 10 seconds it turns to the next truck that has a GPS position and
// shows what that truck is doing. The globe only turns when dragged; the "Open on Live Map" link opens the Live Map on that truck.
export default function LiveGlobe({ trucks = [], drivers = [], onOpen, onShow, focusId = null }) {
  const { isDark } = useTheme();
  const canvasRef = useRef(null);
  const barRef = useRef(null);
  const [index, setIndex] = useState(0);
  const located = useMemo(() => trucks.filter((t) => Number.isFinite(t.currentLat) && Number.isFinite(t.currentLng)), [trucks]);
  const current = located.length ? located[index % located.length] : null;
  // The animation reads the latest values without restarting.
  const live = useRef({ located, index: 0, dark: isDark });
  live.current.dark = isDark;
  live.current.located = located;
  live.current.index = located.length ? index % located.length : 0;
  const rotation = useRef([100, -20, 0]);
  const cycleStart = useRef(Date.now());
  const flight = useRef(null);
  const drag = useRef({ active: false, moved: false, x: 0, y: 0, resumeAt: 0, vx: 0, vy: 0 });
  const openRef = useRef(null);
  useEffect(() => {
    onShow?.(current ? current.id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // A truck picked in the list: turn to it and stay on it for a while before the tour goes on.
  const holdUntil = useRef(0);
  useEffect(() => {
    if (!focusId) return;
    const i = located.findIndex((t) => t.id === focusId);
    if (i >= 0) {
      holdUntil.current = Date.now() + 30000;
      cycleStart.current = Date.now();
      setIndex(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const flyTo = (t) => {
    if (!t) return;
    const from = rotation.current.slice();
    const to = [-t.currentLng, Math.max(-85, Math.min(85, -t.currentLat + 28)), 0];
    flight.current = { from, to, ip: interpolate(from, to), t0: performance.now() };
  };

  // Move on to the next truck every 10 seconds.
  useEffect(() => {
    cycleStart.current = Date.now();
    if (located.length > 1) {
      const id = setInterval(() => {
        if (Date.now() < holdUntil.current) return;
        cycleStart.current = Date.now();
        setIndex((i) => (i + 1) % located.length);
      }, CYCLE_MS);
      return () => clearInterval(id);
    }
    return undefined;
  }, [located.length]);

  // Turn the globe to the truck that is shown.
  useEffect(() => {
    flyTo(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const proj = geoOrthographic().scale(RADIUS).translate([SIZE / 2, SIZE / 2]).clipAngle(90);
    const path = geoPath(proj, ctx);
    let raf = 0;
    let pulse = 0;

    // Drag the globe with the mouse or a finger. Pressing it does nothing: the dashboard stays where it is.
    const d = drag.current;
    const down = (e) => {
      d.active = true;
      d.moved = false;
      d.x = e.clientX;
      d.y = e.clientY;
      flight.current = null;
      d.vx = 0; // a new touch stops a coasting globe at once
      d.vy = 0;
      d.t = performance.now();
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!d.active) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      const r = rotation.current;
      // Rubber band: past the poles the globe still follows the finger, but with growing resistance; it springs back on release.
      const lat = r[1] - dy * 0.4;
      const over = lat > 85 ? lat - 85 : lat < -85 ? lat + 85 : 0;
      const nextLat = over ? (lat > 0 ? 85 : -85) + over * 0.35 : lat;
      d.vx = dx * 0.4;
      d.vy = -dy * 0.4;
      d.t = performance.now();
      rotation.current = [r[0] + dx * 0.4, Math.max(-110, Math.min(110, nextLat)), 0];
      rotation.current = [r[0] + dx * 0.4, Math.max(-85, Math.min(85, r[1] - dy * 0.4)), 0];
    };
    const up = (e) => {
      if (!d.active) return;
      d.active = false;
      d.resumeAt = Date.now() + 3000;
      if (performance.now() - d.t > 90) { d.vx = 0; d.vy = 0; } // held still before letting go: no throw
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const frame = (now) => {
      let arc = 0;
      const f = flight.current;
      if (f) {
        const u = Math.min(1, (now - f.t0) / FLY_MS);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        rotation.current = f.ip(e);
        arc = Math.sin(Math.PI * u); // the camera lifts away in the middle of the move and settles back
        if (u >= 1) flight.current = null;
      } else if (!drag.current.active && (Math.abs(drag.current.vx) > 0.02 || Math.abs(drag.current.vy) > 0.02 || Math.abs(rotation.current[1]) > 85.05)) {
        // Let go: it keeps the speed of the throw and slows down (a spring with velocity, not a stop), and a tilt past the pole eases back.
        const dd = drag.current;
        const r = rotation.current;
        let lat = r[1] + dd.vy;
        if (Math.abs(lat) > 85) lat += ((lat > 0 ? 85 : -85) - lat) * 0.14;
        if (Math.abs(Math.abs(lat) - 85) < 0.06 && Math.abs(lat) > 85) lat = lat > 0 ? 85 : -85;
        rotation.current = [r[0] + dd.vx, lat, 0];
        dd.vx *= 0.95;
        dd.vy *= 0.95;
        dd.resumeAt = Date.now() + 1500;
      } else if (!drag.current.active && Date.now() > drag.current.resumeAt) {
        // A slow drift while a truck is shown, so the globe feels alive.
        rotation.current = [rotation.current[0] + 0.03, rotation.current[1], 0];
      }
      proj.rotate(rotation.current).scale(RADIUS * (1 - 0.14 * arc));
      pulse = (pulse + 0.02) % 1;

      const night = live.current.dark;
      drawGlobe(ctx, proj, { size: SIZE, night, land, graticule, sphere });

      const { located: list, index: idx } = live.current;
      const centre = [-rotation.current[0], -rotation.current[1]];
      list.forEach((t, k) => {
        const ll = [t.currentLng, t.currentLat];
        if (geoDistance(ll, centre) >= 1.55) return;
        const p = proj(ll);
        const on = k === idx;
        const color = statusOf(t).color;
        if (on) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], 8 + pulse * 16, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34,197,94,${1 - pulse})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p[0], p[1], on ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      if (barRef.current) {
        const share = located.length > 1 ? Math.min(1, (Date.now() - cycleStart.current) / CYCLE_MS) : 1;
        barRef.current.style.width = `${share * 100}%`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const driver = current ? drivers.find((d) => d.id === current.assignedDriverId) : null;
  const status = current ? statusOf(current) : STATUS.offline;
  const open = () => current && onOpen?.(current);
  const dark = isDark;
  const mu = dark ? 'text-slate-400' : 'text-gray-500';
  const strong = dark ? 'text-white' : 'text-[#111827]';
  const box = dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';

  return (
    <div className={`rounded-3xl border p-5 h-full flex flex-col shadow-sm ${dark ? 'bg-[#0B1220] border-white/10 text-slate-200' : 'bg-white border-gray-200 text-[#111827]'}`}>
      <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] animate-pulse" />
        Live trucks
      </h2>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {/* Half a globe, centred; the lower half fades out of sight (no line under it). */}
        <div className="relative w-full flex justify-center">
          <div
            aria-label="Globe with the live trucks. Drag to turn it."
            className="no-3d relative overflow-hidden cursor-grab active:cursor-grabbing rounded-t-full"
            style={{ width: 'min(560px, 100%)', aspectRatio: '2 / 1', WebkitMaskImage: 'linear-gradient(to bottom, #000 58%, transparent 96%), radial-gradient(ellipse 50% 100% at 50% 100%, #000 78%, transparent 100%)', WebkitMaskComposite: 'source-in', maskImage: 'linear-gradient(to bottom, #000 58%, transparent 96%), radial-gradient(ellipse 50% 100% at 50% 100%, #000 78%, transparent 100%)', maskComposite: 'intersect' }}
          >
            <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', display: 'block', touchAction: 'none' }} />
          </div>
        </div>

        <div className={`concentric w-full border p-3 ${dark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
          {current ? (
            <div key={current.id} className="anim-slide">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-lg font-bold ${strong}`}>Truck #{current.truckNumber}</p>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: `${status.color}26`, color: dark ? status.color : '#374151' }}>
                  {status.label}
                </span>
              </div>
              <p className={`text-sm ${mu} mt-0.5`}>Driver: {driver ? driver.name : 'Unassigned'}</p>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className={`concentric-inner border px-3 py-2 ${box}`}>
                  <div className={`text-[11px] ${mu}`}>Speed</div>
                  <div className={`text-base font-bold ${strong}`}>{Math.round(current.speed || 0)} mph</div>
                </div>
                <div className={`concentric-inner border px-3 py-2 ${box}`}>
                  <div className={`text-[11px] ${mu}`}>Updated</div>
                  <div className={`text-base font-bold ${strong}`}>{current.lastUpdate ? new Date(current.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                </div>
                <div className={`concentric-inner border px-3 py-2 ${box}`}>
                  <div className={`text-[11px] ${mu}`}>Truck</div>
                  <div className={`text-base font-bold ${strong}`}>{(index % located.length) + 1} / {located.length}</div>
                </div>
              </div>

              <TruckPlace truck={current} className={`text-sm ${mu} mt-3 truncate`} />

              <div className="flex items-center justify-between mt-3">
                <button type="button" onClick={open} className="inline-flex items-center gap-1.5 text-xs font-semibold text-link hover:underline">
                  <MapPinned className="w-3.5 h-3.5" /> Open on Live Map
                </button>
              </div>
              <div className={`h-[3px] rounded mt-3 overflow-hidden ${dark ? 'bg-white/10' : 'bg-gray-200'}`}>
                <div ref={barRef} className="h-full grad-oklch" style={{ width: 0 }} />
              </div>
            </div>
          ) : (
            <div className={`text-sm ${mu} py-3 flex items-start gap-2`}>
              <Radio className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No truck has shared its location yet. Once a driver starts tracking, the truck appears on the globe.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
