import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Field, Panel, primaryButton, useFieldClass } from './ui';

// The owner tells us what they think of 6.11. It is shown on the website after the platform admin approves it.
export default function ReviewCard() {
  const { user } = useAuth();
  const field = useFieldClass();
  const [review, setReview] = useState(undefined);
  const [f, setF] = useState({ rating: 5, body: '', displayName: user?.name ? `Owner, ${user.companyName || user.name}` : '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/reviews/mine').then((r) => {
      setReview(r.review);
      if (r.review) setF({ rating: r.review.rating, body: r.review.body, displayName: r.review.displayName });
    }).catch(() => setReview(null));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const r = await api('/reviews', { method: 'POST', body: { rating: Number(f.rating), body: f.body.trim(), displayName: f.displayName.trim() } });
      setReview(r.review);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not save your review.'));
    } finally {
      setSaving(false);
    }
  };

  if (review === undefined) return null;
  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider">Your review</h2>
        <p className="text-xs text-gray-500 mt-1">Tell other companies what 6.11 does for you. We read every review and show the ones that help.</p>
      </div>
      {review && <p className="text-xs font-semibold text-accent">{review.status === 'approved' ? 'Your review is shown on the website.' : review.status === 'hidden' ? 'Your review is not shown.' : 'Waiting for approval.'}</p>}
      <ErrorBanner message={error} />
      <form onSubmit={save} className="space-y-3">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={Number(f.rating) === i} aria-label={`${i} star${i === 1 ? '' : 's'}`} onClick={() => setF({ ...f, rating: i })}>
              <Star className={`w-6 h-6 ${i <= Number(f.rating) ? 'text-brand-amber fill-current' : 'text-gray-400'}`} />
            </button>
          ))}
        </div>
        <Field label="Your review *"><textarea required rows={4} maxLength={1000} className={field} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Name shown with it *"><input required maxLength={80} className={field} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Sending…' : review ? 'Update my review' : 'Send my review'}</button>
        {saved && <p className="text-xs text-accent font-semibold">Thank you. It will be shown after we have read it.</p>}
      </form>
    </Panel>
  );
}
