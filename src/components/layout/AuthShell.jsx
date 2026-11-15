import React from 'react';
import { MapPin, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import Navbar from './Navbar';

const POINTS = [
  { icon: MapPin, text: 'See every truck on a live map' },
  { icon: RouteIcon, text: 'Trips with route, time and distance' },
  { icon: ShieldCheck, text: 'Your company’s data stays private' },
];

// Shared page for sign in and registration: a brand panel (desktop) and the form.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex flex-col bg-app text-ink">
      {/* The same floating menu bar as the rest of the site, with the Day / Night button in it. */}
      <Navbar />
      <div className="flex-1 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-[#080B10] text-white relative overflow-hidden border-r border-line">
        <div aria-hidden="true" className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-green/20 blur-3xl" />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }}
        />
        <div className="relative" aria-hidden="true" />
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-4xl font-extrabold tracking-tight leading-tight">
            Know where every truck is<span className="text-brand-green">.</span>
          </h2>
          <ul className="space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-gray-300">
                <span className="w-8 h-8 rounded-lg bg-brand-green/15 text-brand-green inline-flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-gray-500">© {new Date().getFullYear()} 6.11 Drive GPS</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-1.5">
              <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-mute">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-6 text-sm text-mute text-center">{footer}</div>}
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
