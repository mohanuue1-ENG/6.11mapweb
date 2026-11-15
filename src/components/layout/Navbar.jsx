import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { homePathFor, useAuth } from '../../context/AuthContext';
import Brand from '../common/Brand';
import ThemeToggle from '../common/ThemeToggle';
import { useAutoClose } from '../../hooks/useAutoClose';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/download', label: 'Get the app' },
];

const isCurrent = (link, pathname) => (link.end ? pathname === link.to : pathname.startsWith(link.to));

// Desktop links with one highlight that slides to the hovered (or focused) link and
// returns to the current page's link when the pointer leaves.
function SlidingLinks() {
  const { pathname } = useLocation();
  const itemRefs = useRef({});
  const animate = useRef(false);
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false });
  const active = LINKS.find((l) => isCurrent(l, pathname))?.to;

  const moveTo = useCallback((key) => {
    const el = key && itemRefs.current[key];
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth, visible: true } : (p) => ({ ...p, visible: false }));
  }, []);

  // Place the highlight on the current page without animating in from nowhere.
  useLayoutEffect(() => {
    moveTo(active);
    const id = requestAnimationFrame(() => {
      animate.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [active, moveTo]);

  useEffect(() => {
    const onResize = () => moveTo(active);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, moveTo]);

  return (
    <nav aria-label="Main" onMouseLeave={() => moveTo(active)} onBlur={() => moveTo(active)} className="relative hidden md:flex items-center">
      <span
        aria-hidden="true"
        className={`absolute top-0 bottom-0 rounded-xl bg-brand-green/15 ${animate.current ? 'transition-all duration-300 ease-out' : ''}`}
        style={{ left: pill.left, width: pill.width, opacity: pill.visible ? 1 : 0 }}
      />
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          ref={(el) => {
            itemRefs.current[l.to] = el;
          }}
          onMouseEnter={() => moveTo(l.to)}
          onFocus={() => moveTo(l.to)}
          className={({ isActive }) =>
            `relative z-10 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${isActive ? 'text-accent' : 'text-mute hover:text-ink'}`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const accountRef = useRef(null);
  // Open menus close by themselves when the page scrolls, or when you tap outside them.
  useAutoClose(mobileOpen, () => setMobileOpen(false), { insideRefs: [headerRef] });
  useAutoClose(menuOpen, () => setMenuOpen(false), { insideRefs: [accountRef] });

  const signOut = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    await logout();
    navigate('/');
  };

  const primary =
    'inline-flex h-9 items-center px-4 rounded-xl bg-brand-green text-[#052E16] text-sm font-semibold hover:bg-brand-green-hover hover:-translate-y-px transition-all duration-200';

  return (
    // The bar floats: it is inset from the edges of the window, rounded, and stays on screen while scrolling.
    <header ref={headerRef} className="sticky top-0 z-50 px-3 sm:px-6 pt-3 pointer-events-none">
      <div className="pointer-events-auto max-w-6xl mx-auto rounded-2xl border border-line bg-surface/95 backdrop-blur-xl shadow-lg shadow-black/10">
        <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-4">
          <Brand />
          <SlidingLinks />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <Link to={homePathFor(user.role)} className={`hidden sm:inline-flex ${primary}`}>
                  Open dashboard
                </Link>
                <div ref={accountRef} className="relative hidden sm:block">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-line bg-surface text-sm font-medium text-ink hover:border-brand-green transition-colors"
                  >
                    <span className="max-w-[120px] truncate">{user?.name}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-mute" />
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-0 mt-2 w-52 rounded-2xl border border-line bg-surface shadow-xl p-1.5 text-sm">
                      <div className="px-2.5 py-2">
                        <div className="font-semibold truncate">{user?.name}</div>
                        <div className="text-xs text-mute truncate">{user?.companyName || 'Platform administration'}</div>
                      </div>
                      <button role="menuitem" onClick={signOut} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-status-red hover:bg-status-red/10 transition-colors">
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex h-9 px-3 items-center text-sm font-semibold text-ink hover:text-accent transition-colors">
                  Sign in
                </Link>
                <Link to="/create-account" className={`hidden sm:inline-flex ${primary}`}>
                  Create account
                </Link>
              </>
            )}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-xl border border-line bg-surface text-ink"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-line px-3 py-3 space-y-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'text-accent bg-brand-green/15' : 'text-mute hover:text-ink hover:bg-surface-2'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <div className="pt-2 flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <Link to={homePathFor(user.role)} onClick={() => setMobileOpen(false)} className="flex-1 h-9 inline-flex items-center justify-center rounded-xl bg-brand-green text-[#052E16] text-sm font-semibold">
                    Open dashboard
                  </Link>
                  <button onClick={signOut} className="h-9 px-3 rounded-xl border border-line text-sm font-medium text-ink">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/create-account" onClick={() => setMobileOpen(false)} className="flex-1 h-9 inline-flex items-center justify-center rounded-xl bg-brand-green text-[#052E16] text-sm font-semibold">
                    Create account
                  </Link>
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-line text-sm font-medium text-ink">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
