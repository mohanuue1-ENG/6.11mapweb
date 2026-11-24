import React from 'react';

// Monthly / Yearly. Shown only when at least one plan has a yearly discount.
export default function BillingSwitch({ value, onChange, discount }) {
  const item = (id, label) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={value === id}
      onClick={() => onChange(id)}
      className={`h-9 px-4 rounded-lg text-sm font-semibold transition-colors ${value === id ? 'bg-brand-green text-[#052E16]' : 'text-mute hover:text-ink'}`}
    >
      {label}
      {id === 'year' && discount > 0 && <span className={`ml-1.5 text-[11px] font-bold ${value === 'year' ? 'text-[#052E16]' : 'text-accent'}`}>Save up to {discount}%</span>}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex p-1 rounded-xl border border-line bg-surface">
      {item('month', 'Monthly')}
      {item('year', 'Yearly')}
    </div>
  );
}

// What to show for a plan: the price for the chosen period, and for a year what it saves.
export function priceFor(plan, interval) {
  if (interval === 'year') {
    const full = plan.priceCents * 12;
    return { cents: plan.yearlyPriceCents, per: 'year', savedCents: Math.max(0, full - plan.yearlyPriceCents), percent: plan.yearlyDiscountPercent || 0 };
  }
  return { cents: plan.priceCents, per: 'month', savedCents: 0, percent: 0 };
}
export const bestDiscount = (plans) => Math.max(0, ...(plans || []).map((p) => p.yearlyDiscountPercent || 0));
