import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// A plain icon button: one tap changes Day <-> Night. It shows the mode you will get
// (a moon in Day mode, a sun in Night mode). The two icons swap with a soft blur.
export default function ThemeToggle({ className = '' }) {
  const { isDark, setThemeSetting } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setThemeSetting(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to Day mode' : 'Switch to Night mode'}
      title={isDark ? 'Switch to Day mode' : 'Switch to Night mode'}
      className={`hit relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 transition-colors hover:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/50 ${className}`}
    >
      <Sun className="swap-icon w-[18px] h-[18px] text-amber-400" data-on={isDark ? 'true' : 'false'} aria-hidden="true" />
      <Moon className="swap-icon w-[18px] h-[18px] text-accent" data-on={isDark ? 'false' : 'true'} aria-hidden="true" />
    </button>
  );
}
