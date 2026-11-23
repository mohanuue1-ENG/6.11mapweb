import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand({ to = '/', light = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="6.11 TruckOS home">
      <span className="h-10 shrink-0 flex items-center">
        <img src="/assets/logo.png" alt="6.11" className="blend-multiply h-8 w-auto" />
      </span>
      <span className={`text-base font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        TruckOS
      </span>
    </Link>
  );
}
