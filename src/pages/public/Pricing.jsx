import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Truck } from 'lucide-react';
import { api } from '../../services/api';
import { money } from '../../services/format';
import { wrap } from './Home';

// Plans and prices come from the platform administrator; nothing is hard-coded here.
export default function Pricing() {
  const [plans, setPlans] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/plans', { auth: false })
      .then((r) => setPlans(r.plans))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className={`${wrap} py-14 space-y-10`}>
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="text-mute text-lg">Simple monthly plans. Every plan includes live tracking, trips, reports and the driver app; plans differ by number of trucks.</p>
      </div>

      {plans === null && !failed && <p role="status" className="text-sm text-mute">Loading plans…</p>}
      {failed && <p className="text-sm text-status-red">Plans could not be loaded. Please try again shortly.</p>}

      {plans && plans.length === 0 && (
        <div className="max-w-xl p-8 rounded-3xl border border-line bg-surface space-y-3">
          <p className="text-mute">Pricing will be published here soon. Create an account to get started.</p>
          <Link to="/create-account" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            Create account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {plans && plans.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div key={p.id} className="p-7 rounded-3xl border border-line bg-surface flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {p.description && <p className="text-sm text-mute">{p.description}</p>}
                <div>
                  <span className="text-4xl font-extrabold">{money(p.priceCents)}</span>
                  <span className="text-sm text-mute"> / month</span>
                </div>
                <ul className="text-sm space-y-2 pt-1">
                  <li className="flex items-center gap-2"><Truck className="w-4 h-4 text-accent" /> {p.truckLimit == null ? 'Unlimited trucks' : `Up to ${p.truckLimit} trucks`}</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent" /> Live tracking, trips and reports</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-accent" /> Driver mobile app</li>
                </ul>
              </div>
              <Link to="/create-account" className="h-11 rounded-xl bg-brand-green text-[#052E16] text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-brand-green-hover transition-colors">
                Create account to join <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
