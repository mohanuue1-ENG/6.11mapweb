import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { TrackingArt, TripPhoneArt, LoadsBoardArt, LoadsPhoneArt } from './ProductArt';

const BLOCKS = [
  {
    id: 'trackova',
    name: 'Trackova',
    tagline: 'Know where every truck is, without a phone call.',
    text: 'Trackova shows your whole fleet on one live map. Open any truck to see its speed, where it is, and when it last reported. Every trip is saved with its exact route, so any question about a delivery has a clear answer.',
    points: [
      ['Live fleet map', 'Every truck on a street map or a globe, with its latest position and how fresh it is.'],
      ['Trips with the exact route', 'Replay each trip from start to finish, with the time it took and the distance driven.'],
      ['Stop alerts', 'If a truck stands still for five minutes during a trip, your office is told and the stop is marked on the map.'],
      ['Works without signal', 'The driver app keeps recording and sends everything when the connection returns.'],
    ],
  },
  {
    id: 'loadova',
    name: 'Loadova',
    tagline: 'Run your loads from the first call to the delivery.',
    text: 'Loadova keeps every load in one clear list. Your dispatcher writes the load, gives it to a driver, and follows it until it is delivered. The driver sees the load in the app and marks it picked up and delivered.',
    points: [
      ['Loads in one place', 'Load number, broker, pick up and drop off with times, and the cash in for each load.'],
      ['Give it to a driver', 'Assign a load to a driver and a truck. It appears in the driver’s app straight away.'],
      ['Fuel records', 'Write each fuel purchase with the state, the place, the receipt number, the gallons and the cost. Totals are added up for you.'],
      ['Clear roles', 'The owner manages the company, dispatchers run the daily work, and drivers see only their own loads and fuel.'],
      ['A trip for each load', 'When a driver starts a trip for a load, the trip carries the load number.'],
    ],
    soon: 'Coming soon: repair records, invoices and settlements.',
  },
];

// One picture card for each product. The text is hidden behind the picture: point at the card (or press it, on a phone) and it appears.
function ProductCard({ b }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      id={b.id}
      aria-labelledby={`${b.id}-title`}
      tabIndex={0}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), setOpen((o) => !o))}
      aria-expanded={open}
      className="no-3d group relative overflow-hidden rounded-2xl border border-line dark:border-white/35 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_0_36px_rgba(34,197,94,0.22)] bg-[#0D1410] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-[0_28px_60px_-12px_rgba(34,197,94,0.35)] hover:border-brand-green/60 min-h-[440px] sm:min-h-[520px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-green scroll-mt-24"
    >
      {/* the picture */}
      <div className="absolute inset-0 flex items-center p-4 sm:p-6">
        <div className="relative w-full pb-8">
          <div className="rounded-xl overflow-hidden border border-white/10">{b.id === 'trackova' ? <TrackingArt /> : <LoadsBoardArt />}</div>
          <div className="absolute bottom-0 right-3 sm:right-6 w-[30%] min-w-[96px] max-w-[160px] drop-shadow-2xl">{b.id === 'trackova' ? <TripPhoneArt /> : <LoadsPhoneArt />}</div>
        </div>
      </div>

      {/* a light that appears on hover */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(34,197,94,0.28),transparent_60%)]" />

      {/* the name, always there */}
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3 pointer-events-none">
        <span className="px-3 py-1 rounded-lg bg-black/60 text-white text-sm font-bold backdrop-blur">{b.name}</span>
        <span className="px-3 py-1 rounded-lg bg-black/60 text-gray-300 text-xs backdrop-blur group-hover:opacity-0 transition-opacity">Point here to read more</span>
      </div>

      {/* the text, shown when the card is pointed at, focused or pressed */}
      <div
        className={`absolute inset-0 overflow-y-auto bg-[#0D1410]/95 text-white p-6 sm:p-8 pb-20 space-y-4 backdrop-blur-sm transition-all duration-300 ease-out
          opacity-0 translate-y-3 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto
          group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto ${open ? '!opacity-100 !translate-y-0 !pointer-events-auto' : ''}`}
      >
        <h2 id={`${b.id}-title`} className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{b.tagline}</h2>
        <p className="text-sm text-gray-300 leading-relaxed">{b.text}</p>
        <ul className="space-y-3">
          {b.points.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <Check className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">{t}</div>
                <p className="text-xs text-gray-400 leading-relaxed">{d}</p>
              </div>
            </li>
          ))}
        </ul>
        {b.soon && <p className="text-xs text-gray-400 border-l-2 border-brand-amber pl-3">{b.soon}</p>}
      </div>

      {/* plans and prices: an icon on the picture, always visible */}
      <Link
        to="/pricing"
        onClick={(e) => e.stopPropagation()}
        aria-label={`See plans and prices for ${b.name}`}
        className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 pl-3 pr-2 py-2 rounded-full bg-brand-green text-white text-sm font-semibold shadow-lg hover:brightness-110 transition"
      >
        Plans and prices <span className="w-7 h-7 rounded-full bg-white/20 grid place-items-center"><ArrowRight className="w-4 h-4" /></span>
      </Link>
    </article>
  );
}

// Two products as two picture cards, side by side.
export default function ProductShowcase() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {BLOCKS.map((b) => <ProductCard key={b.id} b={b} />)}
    </div>
  );
}
