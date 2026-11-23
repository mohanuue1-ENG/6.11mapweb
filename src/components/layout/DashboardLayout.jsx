import ThemeToggle from '../common/ThemeToggle';
import GlobalSearch from '../common/GlobalSearch';
import { useAutoClose } from '../../hooks/useAutoClose';
import React, { useEffect, useRef, useState } from 'react';
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
  MoreHorizontal } from 'lucide-react';

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
  // Desktop: the menu is icons only and opens when the pointer is on it. It then pushes the page aside,
  // so it never covers what is on the page. A short wait stops it flickering as the pointer passes by.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTimer = useRef(null);
  const holdMenu = (open, wait) => {
    clearTimeout(menuTimer.current);
    menuTimer.current = setTimeout(() => setMenuOpen(open), wait);
  };
  useEffect(() => () => clearTimeout(menuTimer.current), []);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (path) => location.pathname === path;

  // PRD Section 9.3 Company Admin Sidebar Items
  const companyNav = [
    { group: 'Operations', label: 'Dashboard', path: '/company/dashboard', icon: LayoutDashboard },
    { label: 'Live Tracking', path: '/company/live-tracking', icon: Navigation, badge: 'LIVE' },
    { label: 'Trips', path: '/company/trips', icon: Route },
    { more: true, label: 'GPS History', path: '/company/gps-history', icon: Radio },
    { group: 'Fleet', label: 'Trucks', path: '/company/trucks', icon: Truck },
    { label: 'Drivers', path: '/company/drivers', icon: Users },
    { more: true, label: 'Reports', path: '/company/reports', icon: BarChart3 },
    { more: true, label: 'Notifications', path: '/company/notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : null },
    { more: true, label: 'Company & Plan', path: '/company/profile', icon: Building2 },
  ];

  // PRD Section 9.9 Super Admin Sidebar Items
  const superAdminNav = [
    { group: 'Platform', label: 'Dashboard', path: '/superadmin', icon: LayoutDashboard },
    { label: 'Requests', path: '/superadmin/requests', icon: Inbox, badge: pendingRequests > 0 ? pendingRequests : null },
    { label: 'Companies', path: '/superadmin/companies', icon: Building2 },
    { more: true, label: 'Plans', path: '/superadmin/plans', icon: CreditCard },
    { more: true, label: 'Payments', path: '/superadmin/payments', icon: DollarSign },
    { more: true, label: 'Security & Audit', path: '/superadmin/audit-logs', icon: Lock },
  ];

  const currentNav = isSuperAdmin ? superAdminNav : companyNav;

  const isDark = theme === 'dark';
  // The soft colour behind the glass belongs to the dashboard only; the public website stays plain.
  useEffect(() => { document.body.classList.add('has-glass'); return () => document.body.classList.remove('has-glass'); }, []);

  // The pages used all day sit on top; the rest fold under "More" (it opens by itself when you are on one of them).
  const coreNav = currentNav.filter((n) => !n.more);
  const moreNav = currentNav.filter((n) => n.more);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreVisible = moreOpen || moreNav.some((n) => isActive(n.path));
  const moreBadge = moreNav.reduce((sum, n) => sum + (Number(n.badge) || 0), 0);

  // The highlight behind the current page is "water": two drops that follow the pointer to the new item,
  // one quick and one lagging. A blur + threshold filter melts them together, so it stretches while it travels,
  // then settles with a little squash. The icon of the page you land on zooms up.
  const linkRefs = useRef({});
  const headRef = useRef(null);
  const [pill, setPill] = useState(null);
  const measure = React.useCallback(() => {
    const el = linkRefs.current[location.pathname];
    if (!el || !el.offsetParent) return setPill(null);
    setPill((old) => {
      const next = { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
      return old && old.top === next.top && old.left === next.left && old.width === next.width && old.height === next.height ? old : next;
    });
  }, [location.pathname]);
  // Re-measure while the menu widens or "More" unfolds (their animations move the items for ~0.3 s).
  useEffect(() => {
    measure();
    const t = setInterval(measure, 16);
    const stop = setTimeout(() => clearInterval(t), 450);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [measure, menuOpen, moreVisible, currentNav.length]);
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const opts = { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' };
    headRef.current?.animate?.([{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,1.22)', offset: 0.3 }, { transform: 'scale(0.98,0.94)', offset: 0.65 }, { transform: 'scale(1,1)' }], opts);
  }, [location.pathname]);

  const renderNavItem = (item, i, list) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    const heading = item.group && item.group !== list[i - 1]?.group;
    return (
      <React.Fragment key={item.path}>
        {heading && (
          <div className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${isDark ? 'text-gray-500' : 'text-gray-400'} ${i > 0 && !menuOpen ? 'lg:mt-2 lg:border-t lg:border-line lg:pt-2 lg:pb-0' : ''}`}>
            <span className={menuOpen ? '' : 'lg:hidden'}>{item.group}</span>
          </div>
        )}
        <Link
          to={item.path}
          ref={(el) => { if (el) linkRefs.current[item.path] = el; }}
          onClick={() => setSidebarOpen(false)}
          title={item.label}
          className={`relative z-10 flex items-center justify-between px-3 lg:px-4 py-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap calm ${
            active
              ? 'text-[#22C55E] font-semibold'
              : isDark
              ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
              : 'text-[#6B7280] hover:text-[#111827] hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon
              className={`w-4 h-4 shrink-0 transition-transform duration-500 ${active ? 'text-[#22C55E] scale-125' : 'scale-100'}`}
              style={{ transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' }}
            />
            <span className={`${menuOpen ? 'lg:opacity-100' : 'lg:opacity-0'} transition-opacity duration-200`}>{item.label}</span>
          </div>
          {item.badge && (
            <span className={`${menuOpen ? 'lg:opacity-100' : 'lg:opacity-0'} transition-opacity text-[9px] font-bold px-1.5 py-0.5 rounded-md ${active ? 'bg-[#22C55E] text-black' : isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
              {item.badge}
            </span>
          )}
        </Link>
      </React.Fragment>
    );
  };


  return (
    <div className={`min-h-dvh transition-colors duration-200 ios-bg ${isDark ? 'text-[#FFFFFF]' : 'text-[#111827]'}`}>
      {/* MOBILE BACKDROP OVERLAY */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998] lg:hidden transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* SIDEBAR (PRD Section 9.3 & 9.9) */}
      <aside
        onMouseEnter={() => holdMenu(true, 120)}
        onMouseLeave={() => holdMenu(false, 150)}
        onFocus={() => holdMenu(true, 0)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) holdMenu(false, 0);
        }}
        className={`group fixed inset-y-0 left-0 z-[9999] w-60 max-w-[80vw] border-r flex flex-col overflow-hidden transition-[transform,width] duration-300 ease-in-out lg:translate-x-0 ${menuOpen ? 'lg:w-60' : 'lg:w-16'} ${
          isDark ? 'ios-glass text-white' : 'ios-glass text-[#111827]'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div className={`h-14 flex items-center justify-between px-4 border-b shrink-0 ${isDark ? 'border-white/10' : 'border-[#E5E7EB]'}`}>
          <Link to={isSuperAdmin ? '/superadmin' : '/company/dashboard'} className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 flex items-center">
              <img src="/assets/logo.png" alt="6.11" className={`blend-multiply h-7 w-auto object-contain object-left ${menuOpen ? 'lg:max-w-none' : 'lg:max-w-[36px]'}`} />
            </div>
            <div className={`flex flex-col whitespace-nowrap ${menuOpen ? 'lg:opacity-100' : 'lg:opacity-0'} transition-opacity duration-200`}>
              <span className="font-extrabold text-sm tracking-tight flex items-center gap-1">
                <span>TruckOS</span>
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
        <div className={`px-3 py-2 border-b shrink-0 ${menuOpen ? '' : 'lg:hidden'} ${isDark ? 'border-white/5' : 'border-[#E5E7EB]'}`}>
          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-numbers ${
            isDark
              ? 'bg-dark-surface2 border-white/10 text-gray-300'
              : 'bg-[#F9FAFB] border-[#E5E7EB] text-gray-700'
          }`}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
              </span>
              <span className="font-medium">{isSuperAdmin ? "Administration" : "Live connection"}</span>
            </div>
            <span className={"font-bold " + (isSuperAdmin ? "text-gray-400" : liveStatus === "live" ? "text-[#22C55E]" : "text-[#F59E0B]")}>{isSuperAdmin ? "PLATFORM" : liveStatus === "live" ? "LIVE" : liveStatus === "offline" ? "NOT CONNECTED" : "RECONNECTING"}</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="relative flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden fade-edges-y">
          {coreNav.map((item, i) => renderNavItem(item, i, coreNav))}

          {moreNav.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setMoreOpen(!moreVisible)}
                aria-expanded={moreVisible}
                title="More"
                className={`calm w-full flex items-center justify-between px-3 lg:px-4 py-2.5 mt-1 rounded-lg text-[13px] font-medium whitespace-nowrap ${
                  isDark ? 'text-[#9CA3AF] hover:text-white hover:bg-white/5' : 'text-[#6B7280] hover:text-[#111827] hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MoreHorizontal className="w-4 h-4 shrink-0" />
                  <span className={menuOpen ? '' : 'lg:hidden'}>More</span>
                </div>
                <span className={`flex items-center gap-1.5 ${menuOpen ? '' : 'lg:hidden'}`}>
                  {!moreVisible && moreBadge > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#EF4444] text-white">{moreBadge}</span>}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${moreVisible ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: moreVisible ? '1fr' : '0fr', transitionTimingFunction: 'var(--ease-out)' }}>
                <div className="overflow-hidden space-y-0.5">{moreNav.map((item, i) => renderNavItem(item, i, moreNav))}</div>
              </div>
            </>
          )}

          {/* The glass lens behind the current page */}
          {pill && (
            <div
              ref={headRef}
              aria-hidden="true"
              className="ios-lens absolute rounded-xl pointer-events-none z-0"
              style={{ margin: 0, top: pill.top, left: pill.left, width: pill.width, height: pill.height, transition: 'top 520ms cubic-bezier(.34,1.45,.64,1), height 400ms ease, left 400ms ease, width 400ms ease' }}
            />
          )}
        </nav>

        {/* Who is signed in, and Sign out. Closed: just a round avatar. Open: a glass card with name and role. */}
        <div className="px-2 pb-3 pt-2 shrink-0">
          <div className={`flex items-center whitespace-nowrap rounded-2xl transition-[padding,background-color,box-shadow] duration-300 ${menuOpen ? 'p-2 justify-between ios-lens' : 'lg:p-0 lg:justify-center p-2 justify-between ios-lens lg:bg-none lg:border-0 lg:shadow-none lg:backdrop-blur-none lg:!bg-transparent'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div title={user?.name || 'Account'} className="w-9 h-9 rounded-full ios-lens flex items-center justify-center font-bold text-sm text-[#16A34A] shrink-0">
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <div className={`min-w-0 ${menuOpen ? 'lg:opacity-100' : 'lg:hidden lg:opacity-0'} transition-opacity duration-200`}>
                <div className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-[#111827]'}`}>
                  {user?.name || 'Administrator'}
                </div>
                <div className={`text-[10px] truncate ${isDark ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
                  {isSuperAdmin ? 'Super Admin' : 'Fleet Admin'}
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className={`${menuOpen ? '' : 'lg:hidden'} p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ease-in-out ${menuOpen ? 'lg:pl-60' : 'lg:pl-16'}`}>
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

            <GlobalSearch pages={currentNav} />
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            {/* Notifications Bell */}
            <Link
              to="/company/notifications"
              className={`hit relative p-2.5 rounded-xl border transition-colors ${
                isDark
                  ? 'bg-dark-surface2 border-white/10 text-gray-300 hover:text-white'
                  : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
              title="Notifications"
            >
              <Bell key={unreadCount} className={`w-4 h-4 ${unreadCount > 0 ? 'bell-swing' : ''}`} />
              {unreadCount > 0 && (
                <span key={unreadCount} className="anim-badge absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
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
                className="hit inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-green text-[#052E16] border-2 border-brand-green/40 transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/60"
              >
                <User className="w-[18px] h-[18px]" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className={`anim-pop floating absolute right-0 mt-2 w-60 rounded-2xl p-2 shadow-2xl z-50 text-xs border ${
                    isDark
                      ? 'bg-dark-surface border-white/10 text-white'
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
        <main className="flex-1 w-full lg:m-3 lg:rounded-2xl lg:border lg:border-line tray p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
