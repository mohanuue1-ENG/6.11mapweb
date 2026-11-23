import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Small building blocks shared by the dashboard pages, so they look the same in Day and Night mode.
export function Panel({ children, className = '' }) {
  const { isDark } = useTheme();
  return (
    <div
      className={`rounded-3xl border p-5 transition-colors ${
        isDark ? 'bg-dark-surface border-white/10 text-white' : 'bg-white border-gray-200 text-[#111827] shadow-sm'
      } ${className} raised`}
    >
      {children}
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, children }) {
  const { isDark } = useTheme();
  return (
    <Panel className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
          {Icon && <Icon className="w-6 h-6 text-brand-green" />}
          {title}
        </h1>
        {subtitle && <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </Panel>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  // A placeholder of the page, shown only if the answer takes longer than 150 ms.
  return (
    <div role="status" aria-label={label} className="skeleton-delay py-6 space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-4/5" />
    </div>
  );
}

export function useFieldClass() {
  const { isDark } = useTheme();
  return `w-full rounded-xl px-3 py-2 text-xs border focus:outline-none focus:border-brand-green ${
    isDark ? 'bg-dark-surface2 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
  }`;
}

export function Field({ label, children }) {
  const { isDark } = useTheme();
  return (
    <label className="block text-xs">
      <span className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
      {children}
    </label>
  );
}

export const primaryButton =
  'px-4 py-2.5 text-xs font-bold rounded-lg bg-brand-green text-black hover:bg-brand-green-hover flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed';

// A dialog drawn on <body>. Inside the page it would be trapped under the header and clipped by the
// page's own layout, which cut the form off on small screens. The page behind stays still, and the
// dialog scrolls inside the screen however tall its form is.
export function useDialogBehavior(onClose) {
  React.useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
}

export function Modal({ title, onClose, children, wide = false, xl = false }) {
  const { isDark } = useTheme();
  useDialogBehavior(onClose);
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[10000] overflow-y-auto overscroll-contain bg-black/70" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={`anim-pop floating relative w-full ${xl ? 'max-w-5xl' : wide ? 'max-w-3xl' : 'max-w-lg'} rounded-3xl border shadow-2xl p-5 sm:p-6 ${
            isDark ? 'bg-dark-surface border-white/10 text-white' : 'bg-white border-gray-200 text-[#111827]'
          }`}
        >
          <div className={`flex items-center justify-between pb-3 mb-4 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <h2 className="text-base font-bold">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-brand-green text-lg leading-none">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
