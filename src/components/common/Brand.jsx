import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand({ to = '/', light = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="6.11 Drive GPS home">
      <span className="w-9 h-9 rounded-xl overflow-hidden border border-brand-green/40 bg-[#080B10] shrink-0">
        <img src="/assets/logo.jpg" alt="" className="w-full h-full object-cover" />
      </span>
      <span className={`text-base font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        <span className={light ? 'text-brand-green' : 'text-accent'}>6.11</span> Drive GPS
      </span>
    </Link>
  );
}
