import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../../services/api';
import { money } from '../../services/format';
import { wrap } from './Home';

const GROUPS = [
  { key: 'trackova', title: 'Trackova', sub: 'Live tracking for your trucks: the map, every trip and its route, alerts and reports.' },
  { key: 'loadova', title: 'Loadova', sub: 'Loads and dispatch: write loads, give them to drivers and follow them to delivery.' },
  { key: 'both', title: 'Trackova + Loadova', sub: 'Both products in one plan: one account, one login, one bill.' },
];

// Plans and prices come from the platform administrator; nothing is hard-coded here.
// Every plan shows its monthly price and its yearly price together, so the choice is clear at a glance.
export default function Pricing() {
  const [plans, setPlans] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/plans', { auth: false })
      .then((r) => setPlans(r.plans))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className={`${wrap} py-14 space-y-12`}>
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight">Plans and pricing</h1>
        <p className="text-mute text-lg">Choose what your company needs. Every plan can be paid monthly or yearly: pay for a year at once and you save.</p>
      </div>

      {plans === null && !failed && <p role="status" className="text-sm text-mute">Loading plans…</p>}
      {failed && <p className="text-sm text-status-red">Plans could not be loaded. Please try again shortly.</p>}

      {plans && plans.length === 0 && (
        <div className="max-w-xl p-8 rounded-xl border border-line bg-surface space-y-3">
          <p className="text-mute">Pricing will be published here soon. Create an account to get started.</p>
          <Link to="/create-account" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            Create account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {plans && GROUPS.map((g) => {
        const mine = plans.filter((p) => (p.product || 'trackova') === g.key);
        if (!mine.length) return null;
        return (
          <section key={g.key} aria-labelledby={`plans-${g.key}`} className="space-y-5">
            <div className="max-w-2xl">
              <h2 id={`plans-${g.key}`} className="text-2xl font-extrabold tracking-tight">{g.title}</h2>
              <p className="text-sm text-mute mt-1">{g.sub}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {mine.map((p) => {
                const canBuy = p.purchasable !== false;
                const saved = Math.max(0, p.priceCents * 12 - p.yearlyPriceCents);
                return (
                  <div key={p.id} className="p-7 rounded-xl border border-line bg-surface flex flex-col justify-between gap-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold">{p.name}</h3>
                        {p.description && <p className="text-sm text-mute mt-1">{p.description}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-line p-3">
                          <div className="text-xs font-semibold text-mute">Monthly</div>
                          <div className="text-2xl font-extrabold mt-0.5">{money(p.priceCents)}</div>
                          <div className="text-xs text-mute">per month</div>
                        </div>
                        <div className={`rounded-lg border p-3 ${p.yearlyDiscountPercent > 0 ? 'border-brand-green bg-brand-green/10' : 'border-line'}`}>
                          <div className="text-xs font-semibold text-mute">Yearly</div>
                          <div className="text-2xl font-extrabold mt-0.5">{money(p.yearlyPriceCents)}</div>
                          <div className="text-xs text-mute">per year</div>
                        </div>
                      </div>
                      {p.yearlyDiscountPercent > 0 && (
                        <p className="text-xs font-semibold text-accent">Pay yearly and save {p.yearlyDiscountPercent}% ({money(saved)} a year).</p>
                      )}

                      <ul className="text-sm space-y-2 pt-1">
                        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent shrink-0" /> {p.truckLimit == null ? 'Unlimited trucks' : `Up to ${p.truckLimit} trucks`}</li>
                        {(p.product === 'trackova' || p.product === 'both') && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent shrink-0" /> Live map, trips and reports</li>}
                        {(p.product === 'loadova' || p.product === 'both') && <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent shrink-0" /> Loads, dispatch and fuel records</li>}
                        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent shrink-0" /> Driver mobile app</li>
                        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent shrink-0" /> Owner and dispatcher accounts</li>
                      </ul>
                    </div>
                    <Link
                      to={canBuy ? '/create-account' : '/contact'}
                      className="h-11 rounded-lg bg-brand-green text-[#052E16] text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-brand-green-hover transition-colors"
                    >
                      {canBuy ? 'Create account to join' : 'Join the waiting list'} <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {plans && plans.length > 0 && (
        <p className="text-sm text-mute max-w-2xl">Prices are in US dollars. Questions about which plan fits your fleet? <Link to="/contact" className="text-link font-semibold hover:underline">Contact us</Link>.</p>
      )}
    </div>
  );
}
