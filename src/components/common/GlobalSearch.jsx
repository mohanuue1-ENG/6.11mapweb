import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Truck, User, Route as RouteIcon, CornerDownLeft } from 'lucide-react';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';

const MAX_PER_GROUP = 4;

// One box that finds a page, a truck, a driver or a trip. Press Ctrl+K (or /) from anywhere to jump into it;
// arrow keys move, Enter opens, Esc closes. Typing messy input is fine: case, spaces and dashes are ignored.
export default function GlobalSearch({ pages = [] }) {
  const { isDark } = useTheme();
  const { trucks = [], drivers = [], trips = [] } = useGps();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  const norm = (v) => String(v ?? '').toLowerCase().replace(/[\s\-_.()+]/g, '');
  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    const has = (...fields) => fields.some((f) => norm(f).includes(n));
    const out = [];
    pages.filter((p) => has(p.label)).slice(0, MAX_PER_GROUP).forEach((p) => out.push({ group: 'Pages', icon: p.icon, title: p.label, to: p.path }));
    trucks.filter((t) => has(t.truckNumber, t.plateNumber, t.make, t.model)).slice(0, MAX_PER_GROUP).forEach((t) =>
      out.push({ group: 'Trucks', icon: Truck, title: `Truck #${t.truckNumber}`, hint: t.plateNumber, to: `/company/live-tracking?truck=${encodeURIComponent(t.id)}` }));
    drivers.filter((d) => has(d.name, d.phone)).slice(0, MAX_PER_GROUP).forEach((d) =>
      out.push({ group: 'Drivers', icon: User, title: d.name, hint: d.phone, to: '/company/drivers' }));
    trips.filter((t) => has(String(t.id).slice(0, 8), t.startAddress)).slice(0, MAX_PER_GROUP).forEach((t) =>
      out.push({ group: 'Trips', icon: RouteIcon, title: `Trip ${String(t.id).slice(0, 8)}`, hint: t.startAddress, to: '/company/trips' }));
    return out;
  }, [q, pages, trucks, drivers, trips]);

  useEffect(() => setCursor(0), [q]);

  // Ctrl/Cmd+K or "/" jumps to the box
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A press outside closes it
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const go = (r) => {
    if (!r) return;
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    navigate(r.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  let lastGroup = '';
  return (
    <div ref={boxRef} className="hidden sm:block relative">
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-list"
        aria-label="Search pages, trucks, drivers and trips"
        placeholder="Search trucks, drivers, trips…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`text-xs rounded-lg pl-9 pr-12 py-2 w-72 border focus:outline-none focus:border-[#22C55E] ${
          isDark ? 'bg-dark-surface2 border-white/10 text-white placeholder-gray-500' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-400'
        }`}
      />
      <kbd className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border pointer-events-none ${isDark ? 'border-white/10 text-gray-500' : 'border-gray-300 text-gray-400'}`}>Ctrl K</kbd>

      {open && q.trim() && (
        <div id="global-search-list" role="listbox" className={`anim-pop floating absolute left-0 mt-2 w-[26rem] max-h-96 overflow-y-auto rounded-xl border p-1.5 z-50 ${isDark ? 'bg-dark-surface2 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
          {results.length === 0 && <div className="px-3 py-4 text-xs text-gray-500">Nothing matches “{q}”. Try a truck number, a driver’s name or a page.</div>}
          {results.map((r, i) => {
            const Icon = r.icon;
            const head = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <React.Fragment key={`${r.group}-${r.to}-${i}`}>
                {head && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{r.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                  className={`calm w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs ${i === cursor ? (isDark ? 'bg-white/10' : 'bg-green-50') : ''}`}
                >
                  {Icon && <Icon className="w-4 h-4 text-[#22C55E] shrink-0" />}
                  <span className="font-semibold truncate">{r.title}</span>
                  {r.hint && <span className="text-gray-400 truncate">{r.hint}</span>}
                  {i === cursor && <CornerDownLeft className="w-3.5 h-3.5 ml-auto text-gray-400 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
