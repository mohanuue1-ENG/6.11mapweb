import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const ACCENTS = {
  green: { bar: '#22C55E', chip: 'rgba(34,197,94,0.14)', ink: '#16A34A' },
  blue: { bar: '#3B82F6', chip: 'rgba(59,130,246,0.14)', ink: '#2563EB' },
  amber: { bar: '#F59E0B', chip: 'rgba(245,158,11,0.16)', ink: '#B45309' },
  red: { bar: '#EF4444', chip: 'rgba(239,68,68,0.14)', ink: '#DC2626' },
  gray: { bar: '#94A3B8', chip: 'rgba(148,163,184,0.18)', ink: '#64748B' },
};

// A summary number: an icon chip, the label, the figure and one line of context. The colour bar on the left
// tells the kind of number at a glance.
export default function StatCard({ title, value, icon: Icon, color = 'green', subtitle, trend }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const c = ACCENTS[color] || ACCENTS.green;
  const label = dark ? 'text-[#9CA3AF]' : 'text-[#6B7280]';

  return (
    <div
      className={`relative overflow-hidden flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 shadow-sm transition-colors ${
        dark ? 'bg-[#0B0F14] border-[#1F2937]' : 'bg-white border-gray-200'
      }`}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c.bar }} aria-hidden="true" />
      {Icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.chip, color: dark ? c.bar : c.ink }}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className={`text-xs font-medium ${label}`}>{title}</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight font-numbers leading-tight ${dark ? 'text-white' : 'text-[#111827]'}`}>{value}</span>
          {trend && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: c.chip, color: dark ? c.bar : c.ink }}>
              {trend}
            </span>
          )}
        </div>
        {subtitle && <div className={`text-[11px] truncate ${label}`}>{subtitle}</div>}
      </div>
    </div>
  );
}
