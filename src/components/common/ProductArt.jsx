import React from 'react';

// Pictures of the two products, drawn for the website: a truck on a live trip (like the driver app) and the loads list.
// They are illustrations, so they carry made-up example data (Truck #T-101, a Des Moines to Chicago load).

export const GREEN = '#22C55E';
export const AMBER = '#F59E0B';
export const BG = '#0D1410';
export const ROAD = '#1F2D26';
export const TXT = '#F3F4F6';
export const MUTED = '#9CA3AF';
export const FONT = 'Switzer, Arial, sans-serif';

export function MapBackdrop({ w, h }) {
  return (
    <g>
      <rect width={w} height={h} fill={BG} />
      <path d={`M0 ${h * 0.62} C ${w * 0.25} ${h * 0.5}, ${w * 0.5} ${h * 0.75}, ${w} ${h * 0.58} L ${w} ${h * 0.7} C ${w * 0.5} ${h * 0.86}, ${w * 0.25} ${h * 0.62}, 0 ${h * 0.74} Z`} fill="#0E2230" />
      <rect x={w * 0.06} y={h * 0.08} width={w * 0.2} height={h * 0.2} rx="10" fill="#10201A" />
      <rect x={w * 0.7} y={h * 0.62} width={w * 0.22} height={h * 0.2} rx="10" fill="#10201A" />
      {[0.15, 0.32, 0.5, 0.68, 0.84].map((p) => <line key={`v${p}`} x1={w * p} y1="0" x2={w * (p + 0.03)} y2={h} stroke={ROAD} strokeWidth="5" />)}
      {[0.2, 0.42, 0.66, 0.88].map((p) => <line key={`h${p}`} x1="0" y1={h * p} x2={w} y2={h * (p - 0.04)} stroke={ROAD} strokeWidth="5" />)}
      <path d={`M0 ${h * 0.35} L ${w} ${h * 0.12}`} stroke="#2A3B33" strokeWidth="9" fill="none" />
      <path d={`M${w * 0.4} 0 L ${w * 0.55} ${h}`} stroke="#2A3B33" strokeWidth="8" fill="none" />
    </g>
  );
}

export function TruckMarker({ x, y, label }) {
  return (
    <g>
      <circle cx={x} cy={y} r="22" fill="none" stroke={GREEN} strokeOpacity="0.35" strokeWidth="2" />
      <circle cx={x} cy={y} r="17" fill={BG} stroke={GREEN} strokeWidth="2.5" />
      <path d={`M${x} ${y - 8} L ${x + 7} ${y + 9} L ${x} ${y + 5} L ${x - 7} ${y + 9} Z`} fill={GREEN} transform={`rotate(38 ${x} ${y})`} />
      <rect x={x - 54} y={y + 24} width="108" height="22" rx="8" fill={BG} stroke={GREEN} strokeOpacity="0.6" />
      <text x={x} y={y + 39} textAnchor="middle" fontFamily={FONT} fontSize="11.5" fontWeight="700" fill={TXT}>{label}</text>
    </g>
  );
}

// A wide picture of the live map: a truck on a trip, the road it has driven, and where it stopped.
export function TrackingArt() {
  return (
    <svg viewBox="0 0 640 400" role="img" className="w-full h-auto rounded-xl" aria-label="A truck on a live trip: the green line is the road it has driven, with the start, a five-minute stop and the truck now.">
      <title>A truck on a live trip</title>
      <MapBackdrop w={640} h={400} />
      <path d="M86 318 C 150 296, 190 230, 290 214 S 450 150, 540 78" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeOpacity="0.9" />
      <path d="M86 318 C 150 296, 190 230, 290 214 S 450 150, 540 78" fill="none" stroke={GREEN} strokeWidth="6" strokeLinecap="round" />
      <circle cx="86" cy="318" r="9" fill={GREEN} stroke="#fff" strokeWidth="3" />
      <circle cx="298" cy="212" r="10" fill={AMBER} stroke="#fff" strokeWidth="3" />
      <rect x="312" y="190" width="116" height="24" rx="8" fill={BG} stroke={AMBER} strokeOpacity="0.7" />
      <text x="370" y="206" textAnchor="middle" fontFamily={FONT} fontSize="11.5" fontWeight="700" fill={AMBER}>Stopped 7 min</text>
      <TruckMarker x={540} y={78} label="#T-101 · 49 mph" />

      <rect x="18" y="18" width="226" height="34" rx="10" fill={BG} stroke={ROAD} />
      <circle cx="36" cy="35" r="5" fill={GREEN} />
      <text x="48" y="39.5" fontFamily={FONT} fontSize="12.5" fontWeight="700" fill={TXT}>LIVE · Truck #T-101</text>
      <text x="170" y="39.5" fontFamily={FONT} fontSize="11.5" fill={MUTED}>Moving</text>

      <rect x="18" y="292" width="240" height="92" rx="14" fill={BG} stroke={ROAD} />
      <text x="34" y="316" fontFamily={FONT} fontSize="13.5" fontWeight="700" fill={TXT}>Abdi Warsame</text>
      <text x="34" y="333" fontFamily={FONT} fontSize="11.5" fill={MUTED}>Trip started 7:10 AM</text>
      {[['DURATION', '45 min', 34], ['DISTANCE', '6.8 mi', 108], ['STATUS', 'Moving', 178]].map(([k, v, x]) => (
        <g key={k}>
          <text x={x} y="354" fontFamily={FONT} fontSize="9.5" fontWeight="700" fill={MUTED}>{k}</text>
          <text x={x} y="372" fontFamily={FONT} fontSize="14" fontWeight="800" fill={k === 'STATUS' ? GREEN : TXT}>{v}</text>
        </g>
      ))}
    </svg>
  );
}

// The driver app while a trip runs: the route, and the trip card with the end button.
export function TripPhoneArt() {
  return (
    <svg viewBox="0 0 300 560" role="img" className="w-full h-auto" aria-label="The driver app during a trip: the route on the map, the trip details and the End Trip button.">
      <title>The driver app during a trip</title>
      <rect x="2" y="2" width="296" height="556" rx="38" fill="#05080A" stroke="#2B3A33" strokeWidth="4" />
      <clipPath id="trip-screen"><rect x="14" y="14" width="272" height="532" rx="28" /></clipPath>
      <g clipPath="url(#trip-screen)">
        <g transform="translate(14 14)">
          <MapBackdrop w={272} h={532} />
          <path d="M58 330 C 90 300, 110 250, 150 220 S 210 150, 230 96" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeOpacity="0.9" />
          <path d="M58 330 C 90 300, 110 250, 150 220 S 210 150, 230 96" fill="none" stroke={GREEN} strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="58" cy="330" r="8" fill={GREEN} stroke="#fff" strokeWidth="3" />
          <TruckMarker x={230} y={96} label="#T-101" />
          <rect x="12" y="30" width="108" height="32" rx="16" fill={BG} stroke={ROAD} />
          <text x="66" y="50" textAnchor="middle" fontFamily={FONT} fontSize="12" fontWeight="700" fill={TXT}>11/25/2026</text>

          <rect x="0" y="352" width="272" height="180" rx="26" fill="#101814" stroke={ROAD} />
          <text x="20" y="384" fontFamily={FONT} fontSize="17" fontWeight="800" fill={TXT}>Load #L-1042</text>
          <text x="20" y="402" fontFamily={FONT} fontSize="11.5" fill={GREEN} fontWeight="700">● Trip in progress</text>
          {[['DURATION', '45 min', 20], ['DISTANCE', '6.8 mi', 100], ['STARTED', '7:10 AM', 184]].map(([k, v, x]) => (
            <g key={k}>
              <text x={x} y="428" fontFamily={FONT} fontSize="9.5" fontWeight="700" fill={MUTED}>{k}</text>
              <text x={x} y="448" fontFamily={FONT} fontSize="15" fontWeight="800" fill={TXT}>{v}</text>
            </g>
          ))}
          <rect x="16" y="468" width="240" height="44" rx="14" fill="#EF4444" />
          <text x="136" y="496" textAnchor="middle" fontFamily={FONT} fontSize="15" fontWeight="800" fill="#fff">End Trip</text>
        </g>
      </g>
    </svg>
  );
}

// The loads list of the office: load numbers, brokers, pick up and drop off, drivers and status.
export function LoadsBoardArt() {
  const rows = [
    ['#L-1045', 'Summit Carriers', 'St. Louis, MO', 'Indianapolis, IN', 'Ahmed Nuur', 'Assigned', AMBER],
    ['#L-1044', 'Prairie Brokers', 'Minneapolis, MN', 'Des Moines, IA', 'John Carter', 'Delivered', GREEN],
    ['#L-1043', 'Midwest Freight', 'Omaha, NE', 'Kansas City, MO', 'Mariam Ali', 'Picked up', '#60A5FA'],
    ['#L-1042', 'ABC Logistics', 'Des Moines, IA', 'Chicago, IL', 'Abdi Warsame', 'Assigned', AMBER],
  ];
  return (
    <svg viewBox="0 0 640 400" role="img" className="w-full h-auto rounded-xl" aria-label="The loads list: four loads with brokers, pick up and drop off places, drivers and status.">
      <title>The Loadova loads list</title>
      <rect width="640" height="400" rx="12" fill={BG} />
      <text x="28" y="44" fontFamily={FONT} fontSize="20" fontWeight="800" fill={TXT}>Loads</text>
      <rect x="520" y="22" width="92" height="30" rx="10" fill={GREEN} />
      <text x="566" y="42" textAnchor="middle" fontFamily={FONT} fontSize="12" fontWeight="800" fill="#052E16">+ New load</text>
      <line x1="28" y1="78" x2="612" y2="78" stroke={ROAD} />
      {['LOAD', 'BROKER', 'PICK UP', 'DROP OFF', 'DRIVER', 'STATUS'].map((h, i) => (
        <text key={h} x={[28, 98, 214, 330, 440, 540][i]} y="70" fontFamily={FONT} fontSize="9.5" fontWeight="700" fill={MUTED}>{h}</text>
      ))}
      {rows.map((r, i) => (
        <g key={r[0]}>
          <line x1="28" y1={128 + i * 62} x2="612" y2={128 + i * 62} stroke={ROAD} />
          <text x="28" y={106 + i * 62} fontFamily={FONT} fontSize="12" fontWeight="800" fill={TXT}>{r[0]}</text>
          <text x="98" y={106 + i * 62} fontFamily={FONT} fontSize="11.5" fill={TXT}>{r[1]}</text>
          <text x="214" y={106 + i * 62} fontFamily={FONT} fontSize="11.5" fill={TXT}>{r[2]}</text>
          <text x="330" y={106 + i * 62} fontFamily={FONT} fontSize="11.5" fill={TXT}>{r[3]}</text>
          <text x="440" y={106 + i * 62} fontFamily={FONT} fontSize="11.5" fill={TXT}>{r[4]}</text>
          <rect x="536" y={92 + i * 62} width="74" height="22" rx="11" fill={r[6]} fillOpacity="0.18" />
          <text x="573" y={107 + i * 62} textAnchor="middle" fontFamily={FONT} fontSize="10.5" fontWeight="800" fill={r[6]}>{r[5]}</text>
        </g>
      ))}
    </svg>
  );
}

// The driver app's Loads tab: one load, where to pick up, where to drop off, and one button.
export function LoadsPhoneArt() {
  return (
    <svg viewBox="0 0 300 560" role="img" className="w-full h-auto" aria-label="The driver app Loads tab: a load from Des Moines to Chicago with the Picked up button.">
      <title>The driver app Loads tab</title>
      <rect x="2" y="2" width="296" height="556" rx="38" fill="#05080A" stroke="#2B3A33" strokeWidth="4" />
      <clipPath id="loads-screen"><rect x="14" y="14" width="272" height="532" rx="28" /></clipPath>
      <g clipPath="url(#loads-screen)">
        <rect x="14" y="14" width="272" height="532" fill="#080D0B" />
        <text x="32" y="74" fontFamily={FONT} fontSize="26" fontWeight="800" fill={TXT}>Loads</text>
        <rect x="26" y="94" width="248" height="300" rx="20" fill="#101814" stroke={ROAD} />
        <text x="42" y="126" fontFamily={FONT} fontSize="17" fontWeight="800" fill={TXT}>#L-1042</text>
        <text x="258" y="126" textAnchor="end" fontFamily={FONT} fontSize="11.5" fontWeight="800" fill={AMBER}>● Assigned</text>
        <text x="42" y="146" fontFamily={FONT} fontSize="11.5" fill={MUTED}>Nov 25 · ABC Logistics</text>
        <text x="42" y="182" fontFamily={FONT} fontSize="9.5" fontWeight="700" fill={MUTED}>PICK UP</text>
        <text x="42" y="202" fontFamily={FONT} fontSize="15" fontWeight="800" fill={TXT}>Des Moines, IA</text>
        <text x="42" y="220" fontFamily={FONT} fontSize="11.5" fill={MUTED}>8:00 AM</text>
        <text x="42" y="254" fontFamily={FONT} fontSize="9.5" fontWeight="700" fill={MUTED}>DROP OFF</text>
        <text x="42" y="274" fontFamily={FONT} fontSize="15" fontWeight="800" fill={TXT}>Chicago, IL</text>
        <text x="42" y="292" fontFamily={FONT} fontSize="11.5" fill={MUTED}>4:00 PM</text>
        <rect x="42" y="320" width="216" height="46" rx="14" fill={GREEN} />
        <text x="150" y="349" textAnchor="middle" fontFamily={FONT} fontSize="15" fontWeight="800" fill="#052E16">Picked up</text>
        <rect x="26" y="480" width="248" height="52" rx="26" fill="#101814" stroke={ROAD} />
        {['Home', 'Trips', 'Loads', 'Alerts'].map((t, i) => (
          <g key={t}>
            {t === 'Loads' && <rect x={30 + i * 61} y="484" width="58" height="44" rx="22" fill={GREEN} fillOpacity="0.18" />}
            <text x={59 + i * 61} y="512" textAnchor="middle" fontFamily={FONT} fontSize="11" fontWeight="700" fill={t === 'Loads' ? GREEN : MUTED}>{t}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
