import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FEATURES, wrap } from './Home';

const DETAILS = {
  'Live map': ['Position, speed and time of the last GPS update', 'Current, stale and offline trucks are shown differently', 'Day, satellite and night map styles'],
  Trips: ['Start and end use a fresh GPS position from the phone', 'Duration and distance are calculated for you', 'Replay any trip on the map'],
  'GPS history': ['Filter by truck and time range', 'Accuracy and speed for every point', 'Route drawn on the map'],
  Reports: ['Totals by driver and by truck', 'Fleet activity with last-seen time', 'Download as CSV'],
  'Driver app': ['Background location while the phone is in a pocket', 'Works offline: points are queued and sent later', 'Never sends the same point twice'],
  'Private by design': ['Separate data for every company', 'Drivers see only their own truck and trips', 'Sign-ins and admin actions are logged'],
};

export default function Features() {
  return (
    <div className={`${wrap} py-14 space-y-10`}>
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight">Features</h1>
        <p className="text-mute text-lg">The tools your office and your drivers use every day.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="p-6 rounded-3xl border border-line bg-surface">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-brand-green/15 text-accent inline-flex items-center justify-center"><Icon className="w-5 h-5" /></span>
              <h2 className="font-bold text-lg">{title}</h2>
            </div>
            <p className="text-sm text-mute mb-3">{text}</p>
            <ul className="space-y-1.5 text-sm">
              {DETAILS[title].map((d) => (
                <li key={d} className="flex gap-2"><span className="text-accent">•</span> {d}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link to="/create-account" className="h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors">
        Create account <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
