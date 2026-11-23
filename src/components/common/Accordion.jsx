import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// A section that folds. The title row is the button; the body opens and closes with one smooth move.
export default function Accordion({ title, icon: Icon, badge, action, defaultOpen = true, children }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-2xl border raised ${isDark ? 'bg-dark-surface border-white/10 text-white' : 'bg-white border-gray-200 text-[#111827]'}`}>
      <div className="flex items-center gap-2 pr-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="calm flex-1 flex items-center gap-2 px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider"
        >
          {Icon && <Icon className="w-4 h-4 text-[#22C55E]" />}
          <span>{title}</span>
          {badge != null && <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{badge}</span>}
          <ChevronDown className={`w-4 h-4 ml-auto text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} style={{ transitionTimingFunction: 'var(--ease-out)' }} />
        </button>
        {action}
      </div>
      <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: open ? '1fr' : '0fr', transitionTimingFunction: 'var(--ease-out)' }}>
        <div className="overflow-hidden">
          <div className={`px-4 pb-4 pt-1 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>{children}</div>
        </div>
      </div>
    </section>
  );
}
