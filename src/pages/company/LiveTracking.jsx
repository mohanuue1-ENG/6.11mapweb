import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import LiveTrackingMap from '../../components/maps/LiveTrackingMap';
import FleetGlobe from '../../components/maps/FleetGlobe';
import { api } from '../../services/api';
import { dateTime } from '../../services/format';
import TruckPlace from '../../components/common/TruckPlace';
import {
  Truck,
  Navigation,
  Gauge,
  Clock,
  Battery,
  Search,
  Filter,
  Radio,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export default function LiveTracking() {
  const { trucks, drivers } = useGps();
  const { theme } = useTheme();
  const [selectedTruckId, setSelectedTruckId] = useState(trucks.length > 0 ? trucks[0].id : null);
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Every click on a truck asks the map to go to it, even when it is already the selected one.
  const [focus, setFocus] = useState(null);
  // The globe is the first view; the street map shows the same trucks on roads.
  const [view, setView] = useState('globe');
  // The truck the globe is zoomed to, and the trip it is on now (start to here).
  const [globeId, setGlobeId] = useState(null);
  const [trip, setTrip] = useState(null);
  const selectTruck = (truck) => {
    setSelectedTruckId(truck.id);
    setFocus({ id: truck.id, n: Date.now() });
    setGlobeId(truck.id);
  };

  // The dashboard globe opens this page with ?truck=<id>: go straight to that truck.
  const [params] = useSearchParams();
  const wantedTruck = params.get('truck');
  useEffect(() => {
    if (!wantedTruck) return;
    const hit = trucks.find((t) => String(t.id) === wantedTruck);
    if (hit) {
      setSelectedTruckId(hit.id);
      setFocus({ id: hit.id, n: Date.now() });
    }
  }, [wantedTruck, trucks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTruck = trucks.find((t) => t.id === selectedTruckId) || trucks[0];

  // Load the active trip of the truck the globe is on: where it started and the road it has driven since.
  useEffect(() => {
    let cancelled = false;
    setTrip(null);
    if (!globeId) return undefined;
    (async () => {
      try {
        const list = await api(`/trips?status=ACTIVE&truckId=${encodeURIComponent(globeId)}&limit=1`);
        const first = list.trips?.[0];
        if (!first) {
          if (!cancelled) setTrip({ none: true });
          return;
        }
        const detail = await api(`/trips/${first.id}`);
        if (!cancelled) setTrip({ info: detail.trip, route: detail.route || [] });
      } catch {
        if (!cancelled) setTrip({ none: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [globeId, trucks.find((t) => t.id === globeId)?.lastUpdate]); // eslint-disable-line react-hooks/exhaustive-deps
  const globeTruck = trucks.find((t) => t.id === globeId) || null;
  const globeDriver = globeTruck ? drivers.find((d) => d.id === globeTruck.assignedDriverId) : null;

  const filteredTrucks = trucks.filter((t) => {
    const matchesSearch =
      t.truckNumber.toLowerCase().includes(filterQuery.toLowerCase()) ||
      t.plateNumber.toLowerCase().includes(filterQuery.toLowerCase()) ||
      t.make.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : t.trackingStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4 lg:flex lg:flex-col lg:h-[calc(100dvh-9.5rem)] lg:space-y-0 lg:gap-4 lg:overflow-hidden">
      {/* Top Banner */}
      <div
        className={`p-5 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-dark-surface border-dark-card' : 'bg-white border-gray-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#22C55E] animate-pulse"></span>
              Live Tracking
            </h1>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Latest known position of every truck
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div
              className={`px-3 py-1.5 rounded-xl border font-bold ${
                theme === 'dark' ? 'bg-dark-surface2 border-dark-card text-white' : 'bg-gray-100 border-gray-200 text-gray-800'
              }`}
            >
              <span className="text-[#22C55E]">{trucks.length}</span> {trucks.length === 1 ? "truck" : "trucks"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Map-First on mobile, 4-col split on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:flex-1 lg:min-h-0">
        {/* Right Column (Map): Order 1 on mobile (Map-First PRD), Order 2 on desktop */}
        <div className="order-1 lg:order-2 lg:col-span-3 space-y-3 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={`inline-flex rounded-xl p-0.5 border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`} role="tablist" aria-label="Map view">
              {[['globe', 'Globe'], ['map', 'Road map']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    view === id ? 'bg-[#22C55E] text-[#052E16]' : theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === 'globe' && globeId && (
              <button type="button" onClick={() => setGlobeId(null)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${theme === 'dark' ? 'border-white/10 text-gray-200 hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                Back to world
              </button>
            )}
          </div>

          {view === 'globe' ? (
            <>
              {/* The globe stands on the very bottom of the page: the page padding below it is cancelled. */}
              <div className={globeTruck ? '' : '-mb-4 sm:-mb-6 lg:-mb-8'}>
                <FleetGlobe
                  trucks={trucks}
                  selectedId={globeId}
                  route={trip?.route || []}
                  onSelect={selectTruck}
                  height={globeTruck ? 'clamp(240px, calc(100dvh - 30rem), 520px)' : 'clamp(280px, calc(100dvh - 17rem), 640px)'}
                />
              </div>
              {globeTruck && (
                <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-dark-surface border-dark-card text-white' : 'bg-white border-gray-200 text-[#111827] shadow-sm'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">Truck #{globeTruck.truckNumber}</span>
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#22C55E]/15 text-[#16A34A]">{globeTruck.trackingStatus}</span>
                    <span className="text-xs text-[#6B7280]">Driver: {globeDriver ? globeDriver.name : 'Unassigned'}</span>
                    <span className="ml-auto text-sm font-bold">{Math.round(globeTruck.speed || 0)} mph</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {trip === null && <div className="text-[#6B7280]">Loading the trip…</div>}
                    {trip?.none && <div className="text-[#6B7280]">No trip is running now. The globe shows where the truck was last seen.</div>}
                    {trip?.info && (
                      <>
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] mt-1 shrink-0" />
                          <div>
                            <div className="font-semibold">Trip started {dateTime(trip.info.startedAt)}</div>
                            {trip.route[0] && <TruckPlace truck={{ currentLat: trip.route[0].latitude, currentLng: trip.route[0].longitude }} className="text-[#6B7280] truncate" />}
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] mt-1 shrink-0" />
                          <div>
                            <div className="font-semibold">Now</div>
                            <TruckPlace truck={globeTruck} className="text-[#6B7280] truncate" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <LiveTrackingMap
              trucks={trucks}
              selectedTruckId={selectedTruckId}
              focus={focus}
              onSelectTruck={(truck) => setSelectedTruckId(truck.id)}
              height="clamp(300px, calc(100dvh - 17rem), 720px)"
            />
          )}
        </div>

        {/* Left Column: Fleet List & Search (Order 2 on mobile, Order 1 on desktop) */}
        <div className="order-2 lg:order-1 lg:col-span-1 space-y-3 flex flex-col h-[400px] lg:h-full lg:min-h-0">
          {/* Search & Filter Header */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              theme === 'dark' ? 'bg-dark-surface border-dark-card' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Search Truck # / Plate..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs border focus:outline-none focus:border-[#22C55E] ${
                  theme === 'dark'
                    ? 'bg-dark-surface2 border-dark-card text-white placeholder-[#9CA3AF]'
                    : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
              {['all', 'moving', 'stopped', 'offline'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`py-1 rounded-lg text-center capitalize transition-colors ${
                    statusFilter === st
                      ? st === 'stopped'
                        ? 'bg-[#EF4444] text-white'
                        : 'bg-[#22C55E] text-black font-extrabold'
                      : theme === 'dark'
                      ? 'bg-dark-surface2 text-[#9CA3AF] hover:text-white'
                      : 'bg-gray-100 text-gray-600 hover:text-black'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Truck Units List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredTrucks.map((truck) => {
              const driver = drivers.find((d) => d.id === truck.assignedDriverId);
              const isSelected = truck.id === selectedTruckId;
              return (
                <button
                  key={truck.id}
                  onClick={() => selectTruck(truck)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-[#22C55E] bg-[#22C55E]/15'
                      : theme === 'dark'
                      ? 'bg-dark-surface border-dark-card hover:border-gray-700'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`font-extrabold text-sm flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      <Truck className={`w-4 h-4 ${isSelected ? 'text-[#22C55E]' : 'text-gray-400'}`} />
                      Truck #{truck.truckNumber}
                    </div>
                    <span
                      className={`text-[9px] uppercase px-2 py-0.5 rounded-full font-bold ${
                        truck.trackingStatus === 'moving'
                          ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/40'
                          : truck.trackingStatus === 'stopped'
                          ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      ● {truck.trackingStatus}
                    </span>
                  </div>

                  <div className={`text-xs mt-1.5 flex justify-between ${theme === 'dark' ? 'text-[#9CA3AF]' : 'text-gray-500'}`}>
                    <span>{truck.plateNumber}</span>
                    <span className={`font-bold text-[11px] ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{truck.speed} mph</span>
                  </div>

                  <div className={`text-[11px] mt-1 truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                    Driver: {driver ? driver.name : 'Unassigned'}
                  </div>

                  <TruckPlace truck={truck} className={`text-[11px] mt-1 truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`} />

                  <div className={`text-[10px] mt-1.5 pt-1.5 border-t flex items-center justify-between ${
                    theme === 'dark' ? 'text-[#9CA3AF] border-gray-700/30' : 'text-gray-500 border-gray-200'
                  }`}>
                    <span>{new Date(truck.lastUpdate).toLocaleTimeString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
