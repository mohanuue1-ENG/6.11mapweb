import React from 'react';
import { GREEN, AMBER, BG, ROAD, TXT, MUTED, FONT, MapBackdrop, TruckMarker } from './ProductArt';

// One drawn picture for each feature. They are illustrations with made-up example data.
const W = 420;
const H = 270;
const Frame = ({ label, children }) => (
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-auto block">
    <title>{label}</title>
    {children}
  </svg>
);
const T = (p) => <text fontFamily={FONT} {...p} />;

export function LiveMapArt() {
  return (
    <Frame label="The live map: three trucks, one moving, one stale and one offline.">
      <MapBackdrop w={W} h={H} />
      <path d="M40 220 C 100 200, 140 150, 210 140 S 320 90, 360 50" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="8" strokeLinecap="round" />
      <path d="M40 220 C 100 200, 140 150, 210 140 S 320 90, 360 50" fill="none" stroke={GREEN} strokeWidth="4.5" strokeLinecap="round" />
      <TruckMarker x={360} y={50} label="#T-101 · 49 mph" />
      <circle cx="120" cy="90" r="13" fill={BG} stroke={AMBER} strokeWidth="2.5" />
      <T x="120" y="95" textAnchor="middle" fontSize="12" fontWeight="800" fill={AMBER}>2</T>
      <rect x="82" y="108" width="76" height="20" rx="7" fill={BG} stroke={AMBER} strokeOpacity="0.6" />
      <T x="120" y="122" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={TXT}>Stale · 12 min</T>
      <circle cx="270" cy="215" r="13" fill={BG} stroke="#6B7280" strokeWidth="2.5" />
      <T x="270" y="220" textAnchor="middle" fontSize="12" fontWeight="800" fill={MUTED}>3</T>
      <rect x="236" y="233" width="68" height="20" rx="7" fill={BG} stroke="#6B7280" strokeOpacity="0.6" />
      <T x="270" y="247" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={MUTED}>Offline</T>
      <rect x="14" y="14" width="132" height="28" rx="9" fill={BG} stroke={ROAD} />
      <circle cx="30" cy="28" r="5" fill={GREEN} />
      <T x="42" y="32" fontSize="11.5" fontWeight="700" fill={TXT}>LIVE · 3 trucks</T>
    </Frame>
  );
}

export function TripsArt() {
  const rows = [['Abdi Warsame', '#T-101', '45 min', '6.8 mi', 'Moving', GREEN], ['Mariam Ali', '#T-104', '3 h 12 min', '168 mi', 'Ended', MUTED], ['John Carter', '#T-102', '5 h 40 min', '312 mi', 'Ended', MUTED]];
  return (
    <Frame label="The trips list with duration and distance, and the route of one trip.">
      <rect width={W} height={H} fill={BG} />
      <T x="20" y="34" fontSize="17" fontWeight="800" fill={TXT}>Trips</T>
      {rows.map((r, i) => (
        <g key={r[0]}>
          <rect x="16" y={50 + i * 46} width="388" height="38" rx="10" fill="#101814" stroke={ROAD} />
          <T x="28" y={66 + i * 46} fontSize="12" fontWeight="800" fill={TXT}>{r[0]}</T>
          <T x="28" y={80 + i * 46} fontSize="10" fill={MUTED}>Truck {r[1]}</T>
          <T x="190" y={74 + i * 46} fontSize="11.5" fontWeight="700" fill={TXT}>{r[2]}</T>
          <T x="268" y={74 + i * 46} fontSize="11.5" fontWeight="700" fill={TXT}>{r[3]}</T>
          <T x="372" y={74 + i * 46} textAnchor="end" fontSize="10.5" fontWeight="800" fill={r[5]}>{r[4] === 'Moving' ? '● Moving' : 'Ended'}</T>
        </g>
      ))}
      <rect x="16" y="192" width="388" height="62" rx="12" fill="#0A120E" stroke={ROAD} />
      <path d="M36 238 C 90 200, 130 236, 190 214 S 290 200, 330 212 S 370 206, 384 202" fill="none" stroke={GREEN} strokeWidth="4" strokeLinecap="round" />
      <circle cx="36" cy="238" r="6" fill={GREEN} stroke="#fff" strokeWidth="2" />
      <circle cx="384" cy="202" r="6" fill={AMBER} stroke="#fff" strokeWidth="2" />
    </Frame>
  );
}

export function HistoryArt() {
  const pts = [[44, 200], [78, 178], [112, 170], [150, 150], [186, 156], [224, 130], [262, 118], [300, 96], [338, 86], [376, 64]];
  return (
    <Frame label="GPS history: a truck and a time range chosen, and every stored position drawn on the map.">
      <MapBackdrop w={W} h={H} />
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={GREEN} strokeOpacity="0.55" strokeWidth="3" />
      {pts.map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill={GREEN} stroke={BG} strokeWidth="2" />)}
      <rect x="14" y="14" width="392" height="32" rx="10" fill={BG} stroke={ROAD} />
      <T x="28" y="34" fontSize="11.5" fontWeight="700" fill={TXT}>Truck #T-101</T>
      <T x="130" y="34" fontSize="11.5" fill={MUTED}>Nov 25 · 7:00 AM – 12:00 PM</T>
      <rect x="338" y="21" width="58" height="18" rx="9" fill={GREEN} />
      <T x="367" y="34" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#052E16">Show</T>
      <rect x="236" y="190" width="170" height="64" rx="12" fill={BG} stroke={ROAD} />
      <T x="250" y="212" fontSize="10" fontWeight="700" fill={MUTED}>POINT 7 OF 10</T>
      <T x="250" y="232" fontSize="13" fontWeight="800" fill={TXT}>52 mph · accuracy 6 m</T>
      <T x="250" y="247" fontSize="10.5" fill={MUTED}>9:42 AM</T>
    </Frame>
  );
}

export function ReportsArt() {
  const bars = [60, 96, 74, 128, 104, 150, 88];
  return (
    <Frame label="Reports: miles driven each day as bars, totals, and a CSV download button.">
      <rect width={W} height={H} fill={BG} />
      <T x="20" y="34" fontSize="17" fontWeight="800" fill={TXT}>Reports</T>
      <rect x="296" y="14" width="108" height="30" rx="10" fill="#101814" stroke={GREEN} strokeOpacity="0.7" />
      <T x="350" y="33" textAnchor="middle" fontSize="11.5" fontWeight="800" fill={GREEN}>Download CSV</T>
      {[['TRIPS', '24'], ['MILES', '1,284'], ['DRIVERS', '5']].map(([k, v], i) => (
        <g key={k}>
          <rect x={16 + i * 130} y="58" width="122" height="52" rx="12" fill="#101814" stroke={ROAD} />
          <T x={28 + i * 130} y="78" fontSize="9.5" fontWeight="700" fill={MUTED}>{k}</T>
          <T x={28 + i * 130} y="100" fontSize="20" fontWeight="800" fill={TXT}>{v}</T>
        </g>
      ))}
      <line x1="20" y1="244" x2="404" y2="244" stroke={ROAD} />
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={34 + i * 54} y={244 - b} width="30" height={b} rx="6" fill={GREEN} fillOpacity={i === 5 ? 1 : 0.45} />
          <T x={49 + i * 54} y="258" textAnchor="middle" fontSize="9.5" fill={MUTED}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</T>
        </g>
      ))}
    </Frame>
  );
}

export function DriverAppArt() {
  return (
    <Frame label="The driver app: a Start Trip button, and a note that points are saved without signal and sent later.">
      <rect width={W} height={H} fill="#0A120E" />
      <rect x="130" y="14" width="160" height="268" rx="26" fill="#05080A" stroke="#2B3A33" strokeWidth="3" />
      <rect x="140" y="24" width="140" height="248" rx="18" fill="#080D0B" />
      <rect x="148" y="34" width="124" height="22" rx="11" fill={AMBER} fillOpacity="0.16" stroke={AMBER} strokeOpacity="0.6" />
      <T x="210" y="49" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={AMBER}>No signal · 12 saved</T>
      <T x="152" y="86" fontSize="15" fontWeight="800" fill={TXT}>Good morning</T>
      <T x="152" y="102" fontSize="10" fill={MUTED}>Truck #T-101</T>
      <rect x="152" y="120" width="116" height="54" rx="14" fill={GREEN} />
      <T x="210" y="153" textAnchor="middle" fontSize="14" fontWeight="800" fill="#052E16">Start Trip</T>
      <rect x="152" y="188" width="116" height="40" rx="12" fill="#101814" stroke={ROAD} />
      <T x="162" y="205" fontSize="9" fontWeight="700" fill={MUTED}>LOAD</T>
      <T x="162" y="219" fontSize="11.5" fontWeight="800" fill={TXT}>#L-1042</T>
      <path d="M62 150 a28 28 0 0 1 38 -6" fill="none" stroke={GREEN} strokeWidth="4" strokeLinecap="round" />
      <path d="M50 134 a48 48 0 0 1 70 -10" fill="none" stroke={GREEN} strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" />
      <circle cx="82" cy="170" r="6" fill={GREEN} />
      <T x="82" y="200" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={MUTED}>Sent when</T>
      <T x="82" y="214" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={MUTED}>signal returns</T>
    </Frame>
  );
}

export function PrivateArt() {
  return (
    <Frame label="Private by design: two companies kept apart, and a log of sign-ins and admin actions.">
      <rect width={W} height={H} fill={BG} />
      {[['Company A', 34, GREEN], ['Company B', 222, '#60A5FA']].map(([n, x, c]) => (
        <g key={n}>
          <rect x={x} y="30" width="164" height="112" rx="14" fill="#101814" stroke={c} strokeOpacity="0.7" strokeWidth="2" />
          <T x={x + 16} y="56" fontSize="13" fontWeight="800" fill={TXT}>{n}</T>
          {[0, 1, 2].map((i) => <rect key={i} x={x + 16} y={70 + i * 22} width={i === 1 ? 96 : 124} height="12" rx="6" fill={c} fillOpacity="0.25" />)}
        </g>
      ))}
      <rect x="190" y="70" width="40" height="40" rx="20" fill={BG} stroke={AMBER} strokeWidth="2.5" />
      <rect x="201" y="86" width="18" height="14" rx="3" fill={AMBER} />
      <path d="M205 86 v-5 a5 5 0 0 1 10 0 v5" fill="none" stroke={AMBER} strokeWidth="2.5" />
      <rect x="34" y="162" width="352" height="86" rx="14" fill="#101814" stroke={ROAD} />
      <T x="50" y="184" fontSize="10" fontWeight="700" fill={MUTED}>ACTIVITY LOG</T>
      {[['7:02 AM', 'Admin signed in'], ['7:10 AM', 'Driver started a trip'], ['7:31 AM', 'Load #L-1042 assigned']].map(([t, a], i) => (
        <g key={t}>
          <circle cx="56" cy={200 + i * 16} r="3.5" fill={GREEN} />
          <T x="68" y={204 + i * 16} fontSize="11" fill={MUTED}>{t}</T>
          <T x="132" y={204 + i * 16} fontSize="11.5" fontWeight="700" fill={TXT}>{a}</T>
        </g>
      ))}
    </Frame>
  );
}

export const FEATURE_ART = {
  'Live map': LiveMapArt,
  Trips: TripsArt,
  'GPS history': HistoryArt,
  Reports: ReportsArt,
  'Driver app': DriverAppArt,
  'Private by design': PrivateArt,
};
