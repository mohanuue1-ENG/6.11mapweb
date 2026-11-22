import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { wrap } from './Home';

const PRINCIPLES = [
  { title: 'Honest data', text: 'We only show positions a phone actually reported. If there is no recent signal, the truck is marked offline and its last known position is labelled as such.' },
  { title: 'Built for drivers too', text: 'The driver app is simple, keeps working without signal, and does not ask drivers to use it while driving.' },
  { title: 'Your data is yours', text: 'Each company’s information is kept separate, and every sign-in and administrative action is recorded.' },
];

export default function About() {
  return (
    <div className={`${wrap} py-14 space-y-10`}>
      <div className="max-w-2xl space-y-3">
        <h1 className="text-4xl font-extrabold tracking-tight">About 6.11 TruckOS</h1>
        <p className="text-mute text-lg leading-relaxed">
          6.11 TruckOS helps trucking companies see where their trucks are and what they have done, using the phones their drivers already carry.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="p-6 rounded-3xl border border-line bg-surface">
            <h2 className="font-bold mb-2">{p.title}</h2>
            <p className="text-sm text-mute leading-relaxed">{p.text}</p>
          </div>
        ))}
      </div>
      <Link to="/create-account" className="h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-brand-green text-[#052E16] font-semibold hover:bg-brand-green-hover transition-colors">
        Create account <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
