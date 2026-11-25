import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../../services/api';

const Stars = ({ n }) => (
  <span className="inline-flex" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= n ? 'text-brand-amber fill-current' : 'text-line'}`} />)}
  </span>
);

// What customers say. Only reviews that real customers wrote and the platform admin approved are shown: none are invented.
export default function Reviews() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api('/reviews', { auth: false }).then(setData).catch(() => setData({ reviews: [], count: 0, average: 0 }));
  }, []);
  if (!data) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20" aria-labelledby="reviews-title">
      <div className="max-w-2xl mb-8 space-y-2">
        <h2 id="reviews-title" className="text-3xl font-extrabold tracking-tight">What our customers say</h2>
        {data.count > 0 ? (
          <p className="text-mute flex items-center gap-2"><Stars n={Math.round(data.average)} /> {data.average} out of 5, from {data.count} review{data.count === 1 ? '' : 's'}.</p>
        ) : (
          <p className="text-mute">We only show reviews written by real customers. The first ones will appear here soon.</p>
        )}
      </div>
      {data.reviews.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.reviews.map((r) => (
            <figure key={r.id} className="p-6 rounded-xl border border-line bg-surface space-y-3">
              <Stars n={r.rating} />
              <blockquote className="text-sm leading-relaxed">{r.body}</blockquote>
              <figcaption className="text-xs text-mute"><span className="font-semibold text-ink">{r.displayName}</span>{r.companyName ? `, ${r.companyName}` : ''}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-dashed border-line text-sm text-mute max-w-2xl">
          Using 6.11 already? The owner of a company can write a review from the dashboard (Company and Plan). It is shown here after we have read it.
        </div>
      )}
    </section>
  );
}
