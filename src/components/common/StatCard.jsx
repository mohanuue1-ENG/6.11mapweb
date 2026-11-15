import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export default function StatCard({ title, value, icon: Icon, color = 'green', subtitle, trend }) {
  const { theme } = useTheme();

  const colorStyles = {
    green: {
      border: theme === 'dark' ? 'border-[#1F2937] hover:border-[#22C55E]' : 'border-gray-200 hover:border-[#22C55E]',
      iconBg: 'bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30',
      badge: 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30',
    },
    blue: {
      border: theme === 'dark' ? 'border-[#1F2937] hover:border-[#3B82F6]' : 'border-gray-200 hover:border-[#3B82F6]',
      iconBg: 'bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30',
      badge: 'bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/30',
    },
    amber: {
      border: theme === 'dark' ? 'border-[#1F2937] hover:border-[#F59E0B]' : 'border-gray-200 hover:border-[#F59E0B]',
      iconBg: 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30',
      badge: 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30',
    },
    red: {
      border: theme === 'dark' ? 'border-[#1F2937] hover:border-[#EF4444]' : 'border-gray-200 hover:border-[#EF4444]',
      iconBg: 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30',
      badge: 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30',
    },
    gray: {
      border: theme === 'dark' ? 'border-[#1F2937] hover:border-gray-600' : 'border-gray-200 hover:border-gray-400',
      iconBg: 'bg-white/10 text-[#9CA3AF] border border-white/10',
      badge: 'bg-white/10 text-gray-300',
    },
  };

  const currentStyle = colorStyles[color] || colorStyles.green;

  return (
    <div
      className={`group relative p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-sm ${
        theme === 'dark' ? 'bg-[#0B0F14]' : 'bg-white'
      } ${currentStyle.border}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
            {title}
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-numbers ${theme === 'dark' ? 'text-[#FFFFFF]' : 'text-[#111827]'}`}>
              {value}
            </span>
            {trend && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-numbers ${currentStyle.badge}`}>
                {trend}
              </span>
            )}
          </div>
          {subtitle && (
            <p className={`text-[11px] truncate pt-0.5 ${theme === 'dark' ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-xl ${currentStyle.iconBg} shadow-sm group-hover:scale-110 transition-transform`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
