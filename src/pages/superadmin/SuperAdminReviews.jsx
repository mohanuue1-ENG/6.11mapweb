import React, { useEffect, useState } from 'react';
import { MessageSquareQuote, Star } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { ErrorBanner, PageHeader, Panel, Spinner } from '../../components/common/ui';

export default function SuperAdminReviews() {
  const { isDark } = useTheme();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/admin/reviews').then((r) => setList(r.reviews)).catch((e) => setError(errorMessage(e, 'Could not load the reviews.')));
  useEffect(() => { load(); }, []);
  const set = async (id, status) => {
    try { await api(`/admin/reviews/${id}`, { method: 'PATCH', body: { status } }); load(); } catch (e) { setError(errorMessage(e, 'Could not change the review.')); }
  };
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="space-y-6 pb-8">
      <PageHeader icon={MessageSquareQuote} title="Reviews" subtitle="Customers write reviews. Only the ones you approve are shown on the website." />
      <ErrorBanner message={error} />
      <Panel className="p-0 overflow-hidden">
        {!list ? <Spinner /> : list.length === 0 ? <p className={`py-10 text-center text-sm ${muted}`}>No reviews yet.</p> : (
          <ul className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
            {list.map((r) => (
              <li key={r.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-bold">{r.companyName} <span className={`font-normal ${muted}`}>· {r.displayName}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating ? 'text-brand-amber fill-current' : 'text-gray-400'}`} />)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'approved' ? 'bg-brand-green/15 text-brand-green' : r.status === 'pending' ? 'bg-amber-500/15 text-amber-600' : 'bg-gray-500/20 text-gray-400'}`}>{r.status}</span>
                  </div>
                </div>
                <p className="text-sm">{r.body}</p>
                <div className="flex gap-2">
                  {r.status !== 'approved' && <button onClick={() => set(r.id, 'approved')} className="px-3 py-1.5 rounded-lg bg-brand-green text-black text-xs font-bold">Approve</button>}
                  {r.status !== 'hidden' && <button onClick={() => set(r.id, 'hidden')} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${isDark ? 'border-white/10' : 'border-gray-200'}`}>Hide</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
