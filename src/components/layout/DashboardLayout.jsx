import ThemeToggle from '../common/ThemeToggle';
import { useAutoClose } from '../../hooks/useAutoClose';
import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import ChangePasswordModal from '../common/ChangePasswordModal';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useGps } from '../../context/GpsContext';
import {
  LayoutDashboard,
  Navigation,
  Route,
  Truck,
  Users,
  BarChart3,
  Bell,
  Settings,
  Building2,
  ShieldCheck,
  CreditCard,
  DollarSign,
  Lock,
  Sun,
  Moon,
  Laptop,
  Search,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Radio,
  FileText,
  Inbox,
  KeyRound,
  User,
  Globe
} from 'lucide-react';

export default function DashboardLayout({ children }) {
  const { user, isSuperAdmin, isCompanyAdmin, logout, switchRole } = useAuth();
  const { theme, themeSetting, setThemeSetting } = useTheme();
  const { unreadCount, liveStatus } = useGps();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  // New access requests waiting for the Super Admin (shown as a badge in the menu).
  const [pendingRequests, setPendingRequests] = useState(0);
  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    const load = () => api('/admin/overview').then((o) => setPendingRequests(o.pendingRequests)).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [isSuperAdmin, location.pathname]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = React.useRef(null);
  // The side menu (phone) and the account menu close by themselves when the page scrolls; the account menu
  // also closes when you tap outside it.
  useAutoClose(sidebarOpen, () => setSidebarOpen(false));
  useAutoClose(userMenuOpen, () => setUserMenuOpen(false), { insideRefs: [userMenuRef] });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (path) => location.pathname === path;

  // PRD Section 9.3 Company Admin Sidebar Items
  const companyNav = [
    { label: 'Dashboard', path: '/company/dashboard', icon: LayoutDashboard },
    { label: 'Live Tracking', path: '/company/live-tracking', icon: Navigation, badge: 'LIVE' },
    { label: 'Trips', path: '/company/trips', icon: Route },
    { label: 'GPS History', path: '/company/gps-history', icon: Radio },
    { label: 'Trucks', path: '/company/trucks', icon: Truck },
    { label: 'Drivers', path: '/company/drivers', icon: Users },
    { label: 'Reports', path: '/company/reports', icon: BarChart3 },
    { label: 'Notifications', path: '/company/notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : null },
    { label: 'Company & Plan', path: '/company/profile', icon: Building2 },
  ];

  // PRD Section 9.9 Super Admin Sidebar Items
  const superAdminNav = [
    { label: 'Dashboard', path: '/superadmin', icon: LayoutDashboard },
    { label: 'Requests', path: '/superadmin/requests', icon: Inbox, badge: pendingRequests > 0 ? pendingRequests : null },
    { label: 'Companies', path: '/superadmin/companies', icon: Building2 },
    { label: 'Plans', path: '/superadmin/plans', icon: CreditCard },
    { label: 'Payments', path: '/superadmin/payments', icon: DollarSign },
    { label: 'Security & Audit', path: '/superadmin/audit-logs', icon: Lock },
  ];

  const currentNav = isSuperAdmin ? superAdminNav : companyNav;

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'bg-[#080B10] text-[#FFFFFF]' : 'bg-[#F3F4F6] text-[#111827]'}`}>
      {/* MOBILE BACKDROP OVERLAY */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998] lg:hidden transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* SIDEBAR (PRD Section 9.3 & 9.9) */}
      <aside
        className={`fixed inset-y-0 left-0 z-[9999] w-60 max-w-[80vw] border-r flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isDark
            ? 'bg-[#0B0F14] border-white/10 text-white shadow-2xl'
            : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#111827] shadow-2xl'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div className={`h-14 flex items-center justify-between px-4 border-b ${isDark ? 'border-white/10' : 'border-[#E5E7EB]'}`}>
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-[#22C55E]/40 bg-[#080B10]">
              <img src="/assets/logo.jpg" alt="6.11 BIS" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight flex items-center gap-1">
                <span className="text-[#22C55E]">6.11</span>
                <span>BIS</span>
              </span>
              <span className="text-[9px] uppercase tracking-wider text-[#22C55E] font-bold">
                {isSuperAdmin ? 'SUPER ADMIN' : user?.companyName || 'COMPANY FLEET'}
              </span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className={`lg:hidden h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${
              isDark
                ? 'border-white/10 text-gray-300 hover:text-white bg-white/5 hover:bg-white/10'
                : 'border-gray-200 text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Tracking Telemetry Pill in Sidebar */}
        <div className={`px-3 py-2 border-b ${isDark ? 'border-white/5' : 'border-[#E5E7EB]'}`}>
          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-numbers ${
            isDark
              ? 'bg-[#111827] border-white/10 text-gray-300'
              : 'bg-[#F9FAFB] border-[#E5E7EB] text-gray-700'
          }`}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
              </span>
              <span className="font-medium">{isSuperAdmin ? "Administration" : "Live connection"}</span>
            </div>
            <span className={"font-bold " + (isSuperAdmin ? "text-gray-400" : liveStatus === "live" ? "text-[#22C55E]" : "text-[#F59E0B]")}>{isSuperAdmin ? "PLATFORM" : liveStatus === "live" ? "LIVE" : liveStatus === "offline" ? "NOT CONNECTED" : "RECONNECTING"}</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {currentNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? 'bg-[#22C55E]/15 text-[#22C55E] font-semibold'
                    : isDark
                    ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    : 'text-[#6B7280] hover:text-[#111827] hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#22C55E]' : ''}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      active
                        ? 'bg-[#22C55E] text-black'
                        : isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Role Switcher & User Tag */}
        <div className={`p-3 border-t ${isDark ? 'border-white/10' : 'border-[#E5E7EB]'}`}>
          <div className={`p-2.5 rounded-2xl border flex items-center justify-between ${
            isDark ? 'bg-[#111827] border-white/10' : 'bg-[#F9FAFB] border-[#E5E7EB]'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center font-bold text-xs shrink-0">
                {user?.name ? user.name[0] : 'U'}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-[#111827]'}`}>
                  {user?.name || 'Administrator'}
                </div>
                <div className={`text-[10px] truncate ${isDark ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
                  {isSuperAdmin ? 'Super Admin' : user?.isInternal ? 'NEB ($0 Internal)' : 'Fleet Admin'}
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        {/* TOP HEADER */}
        <header
          className={`sticky top-0 z-30 h-14 border-b flex items-center justify-between px-4 sm:px-6 backdrop-blur-xl transition-colors duration-200 ${
            isDark
              ? 'bg-[#0B0F14]/95 border-white/10 text-white'
              : 'bg-[#FFFFFF]/95 border-[#E5E7EB] text-[#111827]'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Navigation Menu"
              className={`lg:hidden h-9 w-9 rounded-xl border transition-all active:scale-95 flex items-center justify-center shrink-0 ${
                isDark
                  ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                  : 'border-gray-300 bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Quick Search */}
            <div className="hidden sm:flex items-center relative max-w-xs">
              <Search className={`w-3.5 h-3.5 absolute left-3 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
              <input
                type="text"
                placeholder="Quick search fleet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`text-xs rounded-xl pl-9 pr-3 py-1.5 w-60 border focus:outline-none focus:border-[#22C55E] ${
                  isDark
                    ? 'bg-[#111827] border-white/10 text-white placeholder-gray-500'
                    : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              className={`hidden md:inline-flex text-[11px] px-2.5 py-1 rounded-lg transition-colors ${
                isDark ? 'text-[#9CA3AF] hover:text-[#22C55E]' : 'text-[#6B7280] hover:text-[#22C55E]'
              }`}
            >
              Public Website
            </Link>

            {/* Notifications Bell */}
            <Link
              to="/company/notifications"
              className={`relative p-2 rounded-xl border transition-colors ${
                isDark
                  ? 'bg-[#111827] border-white/10 text-gray-300 hover:text-white'
                  : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>

            {/* Day / Night: one click switches */}
            <ThemeToggle />

            {/* Account menu */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Account menu for ${user?.name || 'your account'}`}
                title={user?.name || 'Account'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-green text-[#052E16] border-2 border-brand-green/40 transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/60"
              >
                <User className="w-[18px] h-[18px]" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className={`absolute right-0 mt-2 w-60 rounded-2xl p-2 shadow-2xl z-50 text-xs border ${
                    isDark
                      ? 'bg-[#0B0F14] border-white/10 text-white'
                      : 'bg-white border-gray-200 text-gray-900 shadow-xl'
                  }`}
                  onClick={() => setUserMenuOpen(false)}
                >
                  <div className="px-2.5 py-1.5">
                    <div className="font-bold truncate">{user?.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {isSuperAdmin ? 'Super Admin' : user?.companyName}
                    </div>
                  </div>
                  <div className={`border-t my-1 ${isDark ? 'border-white/10' : 'border-gray-200'}`}></div>
                  <Link
                    role="menuitem"
                    to="/"
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-[#22C55E]/15 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Public website
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => setPasswordOpen(true)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-[#22C55E]/15 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Change password
                  </button>
                  <button
                    role="menuitem"
                    onClick={logout}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}

        {/* MAIN DASHBOARD CONTENT */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
