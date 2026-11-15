import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime } from '../../services/format';
import { ErrorBanner, Field, PageHeader, Panel, Spinner, useFieldClass } from '../../components/common/ui';

const PAGE = 50;

export default function SuperAdminAuditLogs() {
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({ companyId: '', action: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/companies').then((r) => setCompanies(r.companies)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filters.companyId) q.set('companyId', filters.companyId);
    if (filters.action.trim()) q.set('action', filters.action.trim().toUpperCase());
    try {
      setData(await api(`/admin/audit-logs?${q}`));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the audit log.'));
    }
  }, [filters, offset]);
  useEffect(() => {
    load();
  }, [load]);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Lock} title="Security & Audit" subtitle="Sign-ins and privileged actions. Passwords and tokens are never recorded." />
      <ErrorBanner message={error} />
      <Panel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company">
            <select className={field} value={filters.companyId} onChange={(e) => { setOffset(0); setFilters({ ...filters, companyId: e.target.value }); }}>
              <option value="">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Action (exact, e.g. LOGIN_FAILED)">
            <input className={field} value={filters.action} onChange={(e) => { setOffset(0); setFilters({ ...filters, action: e.target.value }); }} placeholder="Any action" />
          </Field>
        </div>
      </Panel>
      <Panel className="p-0 overflow-hidden">
        {!data && !error ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Time', 'Action', 'Company', 'By', 'Details', 'IP'].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {data?.logs.length === 0 && <tr><td colSpan={6} className={`py-10 text-center ${muted}`}>Nothing matches.</td></tr>}
                {data?.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-4 whitespace-nowrap">{dateTime(l.createdAt)}</td>
                    <td className="py-3 px-4 font-bold">{l.action}</td>
                    <td className="py-3 px-4">{l.companyName || '—'}</td>
                    <td className="py-3 px-4">{l.actor ? `${l.actor.name} (${l.actor.role})` : '—'}</td>
                    <td className={`py-3 px-4 max-w-xs truncate ${muted}`} title={JSON.stringify(l.details)}>{Object.keys(l.details || {}).length ? JSON.stringify(l.details) : '—'}</td>
                    <td className={`py-3 px-4 ${muted}`}>{l.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={`flex items-center justify-between px-4 py-3 border-t text-xs ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
          <span className={muted}>Showing {data ? `${offset + 1}–${offset + data.logs.length}` : '…'}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label="Newer" className="p-1.5 rounded-lg border border-white/10 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <button disabled={!data?.hasMore} onClick={() => setOffset(offset + PAGE)} aria-label="Older" className="p-1.5 rounded-lg border border-white/10 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
