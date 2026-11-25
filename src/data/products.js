// The two products and what they are called. The loads product is named here and nowhere else, so renaming it is one edit.
export const PRODUCT_NAMES = { trackova: 'Trackova', loadova: 'Loadova', both: 'Trackova + Loadova' };

export const PRODUCT_CARDS = {
  loadova: {
    tag: 'Loads only',
    name: 'Loadova',
    sub: 'Run your loads, drivers and money in one place.',
    features: ['Load tracking with Cash In', 'Driver and truck management', 'Fuel records with totals', 'Pick up and drop off for every load', 'Roles for the owner, dispatchers and drivers'],
    cta: 'Get Loadova',
  },
  trackova: {
    tag: 'Tracking only',
    name: 'Trackova',
    sub: 'See every truck live and every route driven.',
    features: ['Live map of every truck', 'Trip history with the exact route', 'Reports on trips, distance and drivers', 'Driver mobile app'],
    cta: 'Get Trackova',
  },
  both: {
    tag: 'Best value',
    name: 'Trackova + Loadova',
    sub: 'Tracking and loads together: one account, one plan, one bill.',
    features: ['Everything in Trackova', 'Everything in Loadova', 'One login for both dashboards', 'One bill'],
    cta: 'Get both',
  },
};
