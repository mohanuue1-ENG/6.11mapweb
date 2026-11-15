import React from 'react';

// Decorative map graphic for the home page. It shows no data: just a route, pins and the
// three status colours the real map uses (moving, stopped, offline).
export default function RouteIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 560 380" role="img" aria-label="Illustration of a truck route on a map" className={className}>
      <rect x="1" y="1" width="558" height="378" rx="24" fill="var(--surface-main)" stroke="var(--glass-border)" strokeWidth="2" />
      <g stroke="var(--glass-border)" strokeWidth="1">
        {[70, 140, 210, 280, 350].map((y) => <line key={y} x1="20" y1={y} x2="540" y2={y} />)}
        {[80, 160, 240, 320, 400, 480].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="360" />)}
      </g>
      <g fill="none" stroke="var(--glass-border)" strokeWidth="12" strokeLinecap="round" opacity="0.9">
        <path d="M30 120 C 150 140, 220 60, 330 90 S 480 150, 535 110" />
        <path d="M120 360 C 140 260, 250 250, 300 180 S 400 60, 410 20" />
      </g>
      <path d="M60 310 C 150 250, 190 330, 270 240 S 400 130, 500 70" fill="none" stroke="#22C55E" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 12" opacity="0.5" />
      <path d="M60 310 C 150 250, 190 330, 270 240" fill="none" stroke="#22C55E" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="310" r="9" fill="#22C55E" stroke="var(--surface-main)" strokeWidth="3" />
      <circle cx="270" cy="240" r="22" fill="#22C55E" opacity="0.18" />
      <circle cx="270" cy="240" r="11" fill="#22C55E" stroke="var(--surface-main)" strokeWidth="3" />
      <circle cx="500" cy="70" r="9" fill="var(--surface-main)" stroke="#22C55E" strokeWidth="3" />
      <circle cx="400" cy="300" r="9" fill="#EF4444" stroke="var(--surface-main)" strokeWidth="3" />
      <circle cx="150" cy="110" r="9" fill="#9CA3AF" stroke="var(--surface-main)" strokeWidth="3" />
      <g transform="translate(26 332)" fontSize="13" fontWeight="600" fill="var(--text-secondary)" fontFamily="Inter, system-ui, sans-serif">
        <circle cx="6" cy="-4" r="5" fill="#22C55E" />
        <text x="18" y="0">Moving</text>
        <circle cx="86" cy="-4" r="5" fill="#EF4444" />
        <text x="98" y="0">Stopped</text>
        <circle cx="170" cy="-4" r="5" fill="#9CA3AF" />
        <text x="182" y="0">Offline</text>
      </g>
    </svg>
  );
}
