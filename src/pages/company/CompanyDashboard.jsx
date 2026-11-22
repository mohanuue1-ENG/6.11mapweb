import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import StatCard from '../../components/common/StatCard';
import LiveGlobe from '../../components/common/LiveGlobe';
import TruckPlace from '../../components/common/TruckPlace';
import {
  Truck,
  Users,
  Radio,
  WifiOff,
  Navigation,
  StopCircle,
  PlayCircle,
  CheckCircle2,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  Gauge,
  Activity
} from 'lucide-react';

export default function CompanyDashboard() {
  const { user, company } = useAuth();
  const { trucks, drivers, trips, notifications } = useGps();
  const { theme } = useTheme();
  const navigate = useNavigate();
  // The truck the globe is showing now, highlighted in the list.
  const [shownId, setShownId] = useState(null);
  // A tap on a truck opens the Live Map page on that truck.
  const openOnMap = (truck) => navigate(`/company/live-tracking?truck=${encodeURIComponent(truck.id)}`);

  const isDark = theme === 'dark';

  // The PRD Section 4 & 9.3 Mandated Statistics
  const totalTrucks = trucks.length;
  const activeDrivers = drivers.filter((d) => d.status === 'active').length;
  const movingTrucks = trucks.filter((t) => t.trackingStatus === 'moving').length;
  const stoppedTrucks = trucks.filter((t) => t.trackingStatus === 'stopped').length;
  const offlineTrucks = trucks.filter((t) => t.trackingStatus === 'offline').length;
  const activeTrips = trips.filter((t) => t.status === 'active').length;
  const completedTrips = trips.filter((t) => t.status === 'completed').length;
  const alertCount = notifications.filter((n) => !n.read).length;

  const recentTrips = trips.slice(0, 4);
  const share = (n) => `${totalTrucks ? Math.round((n / totalTrucks) * 100) : 0}%`;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Welcome Card */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          isDark
            ? 'bg-[#0B0F14] border-white/10 text-white shadow-xl'
            : 'bg-white border-gray-200 text-[#111827] shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E] shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold">
                {company?.name || user?.companyName} Dashboard
              </h1>
              {user?.isInternal && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/40 uppercase tracking-wider font-numbers">
                  Internal Fleet ($0 / mo)
                </span>
              )}
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
              {[company?.dotNumber && `USDOT: ${company.dotNumber}`, company?.mcNumber && `MC: ${company.mcNumber}`].filter(Boolean).join(' • ') || 'Fleet overview'}
            </p>
          </div>
        </div>

        {/* Quick Top Actions */}
        <div className="flex items-center gap-2">
          <Link
            to="/company/trucks"
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1.5 ${
              isDark
                ? 'border-white/10 hover:border-[#22C55E] text-white hover:bg-white/5'
                : 'border-gray-200 hover:border-[#22C55E] text-gray-800 hover:bg-gray-50'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#22C55E]" /> Add Truck
          </Link>
          <Link
            to="/company/drivers"
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1.5 ${
              isDark
                ? 'border-white/10 hover:border-[#22C55E] text-white hover:bg-white/5'
                : 'border-gray-200 hover:border-[#22C55E] text-gray-800 hover:bg-gray-50'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#22C55E]" /> Add Driver
          </Link>
          <Link
            to="/company/live-tracking"
            className="px-4 py-2 text-xs font-bold rounded-xl bg-[#22C55E] text-black hover:bg-[#16a34a] transition-all flex items-center gap-1.5 shadow-lg shadow-[#22C55E]/20 active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5" /> Fullscreen Map
          </Link>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard title="Total trucks" value={totalTrucks} icon={Truck} color="blue" subtitle="In your fleet" />
        <StatCard title="Moving" value={movingTrucks} icon={Navigation} color="green" subtitle={`${share(movingTrucks)} of fleet`} />
        <StatCard title="Stopped" value={stoppedTrucks} icon={StopCircle} color="amber" subtitle={`${share(stoppedTrucks)} of fleet`} />
        <StatCard title="Offline" value={offlineTrucks} icon={WifiOff} color="gray" subtitle={`${share(offlineTrucks)} of fleet`} />
        <StatCard title="Active drivers" value={activeDrivers} icon={Users} color="blue" subtitle="Assigned operators" />
        <StatCard title="Active trips" value={activeTrips} icon={PlayCircle} color="green" subtitle={alertCount > 0 ? `${alertCount} unread alert${alertCount === 1 ? '' : 's'}` : 'Journeys underway'} />
      </div>

      {/* Main Grid: Prominent Live GPS Map + Live Trucks Panel (PRD 9.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* The globe turns to a different live truck every 10 seconds (2 cols). The full map is on the Live Map page. */}
        <div className="lg:col-span-2">
          <LiveGlobe trucks={trucks} drivers={drivers} onOpen={openOnMap} onShow={setShownId} />
        </div>

        {/* Right: Live Trucks Compact Panel (PRD 9.3) */}
        <div className="h-full min-h-0">
          <div
            className={`p-4 rounded-3xl border space-y-3 flex flex-col h-full min-h-[420px] max-h-[640px] ${
              isDark
                ? 'bg-[#0B0F14] border-white/10 text-white shadow-xl'
                : 'bg-white border-gray-200 text-[#111827] shadow-sm'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-2.5 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#22C55E]" /> Live Trucks Stream ({trucks.length})
              </h3>
            </div>

            {/* One line per truck, one under the other */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {trucks.length === 0 && <p className={`text-xs py-6 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No trucks yet.</p>}
              {trucks.map((truck) => {
                const driver = drivers.find((d) => d.id === truck.assignedDriverId);
                const isSelected = shownId === truck.id;
                const dot = truck.trackingStatus === 'moving' ? '#22C55E' : truck.trackingStatus === 'stopped' ? '#F59E0B' : '#94A3B8';
                return (
                  <button
                    type="button"
                    key={truck.id}
                    onClick={() => openOnMap(truck)}
                    title={`Open Live Map on truck ${truck.truckNumber}`}
                    className={`w-full h-11 px-3 rounded-xl border flex items-center gap-2.5 text-left text-xs whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'border-[#22C55E] bg-[#22C55E]/12'
                        : isDark
                        ? 'border-white/10 bg-white/5 hover:border-[#22C55E]/60'
                        : 'border-gray-200 bg-gray-50 hover:border-[#22C55E]/60'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} aria-label={truck.trackingStatus} />
                    <Truck className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#22C55E]' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <span className={`font-bold shrink-0 ${isDark ? 'text-white' : 'text-[#111827]'}`}>#{truck.truckNumber}</span>
                    <span className={`flex-1 truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{driver ? driver.name : 'Unassigned'}</span>
                    <span className={`font-bold font-numbers shrink-0 ${isDark ? 'text-white' : 'text-[#111827]'}`}>{Math.round(truck.speed || 0)} mph</span>
                    <span className={`font-numbers shrink-0 w-14 text-right ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      {truck.lastUpdate ? new Date(truck.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Trip Activity & Alerts (PRD 9.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Trips Table (2 cols) */}
        <div
          className={`lg:col-span-2 p-5 rounded-3xl border space-y-3 ${
            isDark
              ? 'bg-[#0B0F14] border-white/10 text-white shadow-xl'
              : 'bg-white border-gray-200 text-[#111827] shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-[#22C55E]" /> Recent Fleet Trips ({trips.length})
            </h3>
            <Link to="/company/trips" className="text-xs text-[#22C55E] hover:underline font-semibold">
              View All Trips
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                  isDark ? 'border-white/10 text-[#9CA3AF]' : 'border-gray-200 text-[#6B7280]'
                }`}>
                  <th className="py-2.5 px-3">Trip ID</th>
                  <th className="py-2.5 px-3">Truck</th>
                  <th className="py-2.5 px-3">Driver</th>
                  <th className="py-2.5 px-3">Start Location</th>
                  <th className="py-2.5 px-3">Distance</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {recentTrips.map((t) => {
                  const trk = trucks.find((tr) => tr.id === t.truckId);
                  const drv = drivers.find((d) => d.id === t.driverId);
                  return (
                    <tr key={t.id} className={isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                      <td className="py-3 px-3 font-bold text-[#22C55E]">{String(t.id).slice(0, 8)}</td>
                      <td className="py-3 px-3 font-semibold">
                        #{trk ? trk.truckNumber : 'N/A'}
                      </td>
                      <td className={`py-3 px-3 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{drv ? drv.name : 'Driver'}</td>
                      <td className={`py-3 px-3 truncate max-w-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{t.startAddress}</td>
                      <td className="py-3 px-3 font-bold">{t.distance == null ? '—' : `${t.distance} mi`}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            t.status === 'active'
                              ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/40'
                              : 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/40'
                          }`}
                        >
                          ● {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Alerts Feed */}
        <div
          className={`p-5 rounded-3xl border space-y-3 ${
            isDark
              ? 'bg-[#0B0F14] border-white/10 text-white shadow-xl'
              : 'bg-white border-gray-200 text-[#111827] shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B]" /> Notifications Feed
            </h3>
            <Link to="/company/notifications" className="text-xs text-[#22C55E] hover:underline font-semibold">
              All Alerts
            </Link>
          </div>

          <div className="space-y-2.5">
            {notifications.slice(0, 4).map((notif) => (
              <div
                key={notif.id}
                className={`p-3 rounded-2xl border text-xs space-y-1 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{notif.title}</span>
                  <span className={`text-[10px] font-numbers ${isDark ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
                    {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className={`text-[11px] line-clamp-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {notif.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
