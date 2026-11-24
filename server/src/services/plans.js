// What a plan costs for a billing period. Yearly = twelve months of the monthly price, less the plan's yearly discount.
export const yearlyCents = (priceCents, discountPercent = 0) => Math.round((priceCents * 12 * (100 - discountPercent)) / 100);
export const amountFor = (plan, interval) => (interval === 'year' ? yearlyCents(plan.price_cents, plan.yearly_discount_percent) : plan.price_cents);
export const periodDays = (interval) => (interval === 'year' ? 365 : 30);

export const PRODUCTS = ['trackova', 'loadova', 'both'];
// The products a company can use, from the product of its plan.
export const productsOf = (product) => (product === 'both' ? ['trackova', 'loadova'] : product ? [product] : []);
