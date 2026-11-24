import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../../services/api';
import { money } from '../../services/format';
import { PRODUCT_CARDS } from '../../data/products';

const ORDER = ['loadova', 'trackova', 'both'];
const LABEL = { loadova: 'Loadova', trackova: 'Trackova', both: 'Both' };

// One card with a switch: Loadova (loads), Trackova (tracking), or both together. The price is the lowest
// published plan for the chosen product; a product that cannot be bought yet sends the person to the contact page.
export default function ProductSwitchCard() {
  const [which, setWhich] = useState('trackova');
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    api('/plans', { auth: false }).then((r) => setPlans(r.plans || [])).catch(() => {});
  }, []);

  const card = PRODUCT_CARDS[which];
  const mine = plans.filter((p) => (p.product || 'trackova') === which);
  const cheapest = mine.length ? mine.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b)) : null;
  const canBuy = mine.some((p) => p.purchasable);
  const best = Math.max(0, ...mine.map((p) => p.yearlyDiscountPercent || 0));

  return (
    <div className="max-w-xl mx-auto">
      <div role="radiogroup" aria-label="Product" className="flex gap-1 p-1 rounded-xl border border-line bg-surface">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={which === k}
            onClick={() => setWhich(k)}
            className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-colors ${which === k ? 'bg-brand-green text-[#052E16]' : 'text-mute hover:text-ink'}`}
          >
            {LABEL[k]}
          </button>
        ))}
      </div>

      <div key={which} className="anim-pop mt-4 p-6 rounded-xl border border-line bg-surface">
        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-green/15 text-accent">{card.tag}</span>
        <h3 className="text-2xl font-extrabold mt-3">{card.name}</h3>
        <p className="text-sm text-mute mt-1">{card.sub}</p>

        <div className="mt-5">
          {cheapest ? (
            <>
              <span className="text-xs text-mute">From </span>
              <span className="text-3xl font-extrabold">{money(cheapest.priceCents)}</span>
              <span className="text-sm text-mute"> / month</span>
              {best > 0 && <p className="text-xs font-semibold text-accent mt-1">Save up to {best}% when you pay yearly</p>}
            </>
          ) : (
            <p className="text-sm font-semibold text-mute">Pricing coming soon</p>
          )}
        </div>

        <ul className="mt-5 text-sm">
          {card.features.map((f) => (
            <li key={f} className="flex items-start gap-2 py-2 border-t border-line">
              <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" /> <span>{f}</span>
            </li>
          ))}
        </ul>

        <Link
          to={canBuy || which === 'trackova' ? '/create-account' : '/contact'}
          className="mt-5 h-12 rounded-lg bg-brand-green text-[#052E16] font-semibold flex items-center justify-center gap-1.5 hover:bg-brand-green-hover transition-colors"
        >
          {canBuy || which === 'trackova' ? card.cta : 'Join the waiting list'} <ArrowRight className="w-4 h-4" />
        </Link>
        {!(canBuy || which === 'trackova') && <p className="text-xs text-mute text-center mt-2">This is coming soon. Contact us and we will tell you when it opens.</p>}
      </div>
    </div>
  );
}
