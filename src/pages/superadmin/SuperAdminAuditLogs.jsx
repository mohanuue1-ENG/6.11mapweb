import React, { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, ChevronLeft, ChevronRight, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime } from '../../services/format';
import { ErrorBanner, Field, PageHeader, Panel, Spinner, useFieldClass } from '../../components/common/ui';

const PAGE = 50;

// High risk: something failed, was removed, or changes money and access. Low risk: normal daily work.
const RISK = {
  high: { label: 'High risk', hint: 'Failed sign-ins, deletions, payments, plan and company changes', icon: AlertOctagon, text: 'text-red-500', badge: 'bg-red-500/15 text-red-500 border-red-500/40', ring: 'border-red-500/50' },
  medium: { label: 'Medium risk', hint: 'Password and access changes, edits to records', icon: ShieldAlert, text: 'text-amber-500', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/40', ring: 'border-amber-500/50' },
  low: { label: 'Low risk', hint: 'Normal daily work', icon: ShieldCheck, text: 'text-brand-green', badge: 'bg-brand-green/15 text-brand-green border-brand-green/40', ring: 'border-brand-green/50' },
};

export default function SuperAdminAuditLogs() {
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({ companyId: '', action: '', risk: '' });
  const [summary, setSummary] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const loadBlocked = useCallback(() => api('/admin/blocked-users').then((r) => setBlocked(r.users)).catch(() => {}), []);
  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);
  const unblock = async (id) => {
    try {
      await api(`/admin/blocked-users/${id}/unblock`, { method: 'POST', body: {} });
      loadBlocked();
    } catch (err) {
      setError(errorMessage(err, 'Could not open this account.'));
    }
  };
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/companies').then((r) => setCompanies(r.companies)).catch(() => {});
    api('/admin/audit-summary?days=7').then(setSummary).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filters.companyId) q.set('companyId', filters.companyId);
    if (filters.risk) q.set('risk', filters.risk);
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

      {/* How much happened in the last 7 days at each risk level. Press one to see only those. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(RISK).map(([key, r]) => {
          const Icon = r.icon;
          const active = filters.risk === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setOffset(0); setFilters({ ...filters, risk: active ? '' : key }); }}
              aria-pressed={active}
              className={`no-3d text-left p-4 rounded-2xl border transition-colors ${active ? `${r.ring} ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}` : isDark ? 'border-white/10 hover:border-white/25' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className={`flex items-center gap-2 text-xs font-bold ${r.text}`}><Icon className="w-4 h-4" /> {r.label}</div>
              <div className="mt-2 text-3xl font-extrabold font-numbers">{summary ? summary.totals[key] : '–'}</div>
              <div className={`mt-1 text-[11px] ${muted}`}>last 7 days · {r.hint}</div>
            </button>
          );
        })}
      </div>

      {blocked.length > 0 && (
        <Panel>
          <div className="flex items-center gap-2 text-sm font-bold text-red-500"><AlertOctagon className="w-4 h-4" /> Blocked accounts</div>
          <p className={`mt-1 text-xs ${muted}`}>These accounts blocked themselves after 10 wrong passwords in a row. Open one only when you are sure it is the real owner.</p>
          <ul className="mt-3 space-y-2 text-xs">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3">
                <span><span className="font-bold">{u.name}</span> ({u.role}) · {u.email}{u.companyName ? ` · ${u.companyName}` : ''} · {dateTime(u.blockedAt)}</span>
                <button type="button" onClick={() => unblock(u.id)} className="no-3d shrink-0 px-3 py-1.5 rounded-lg border border-brand-green/40 text-brand-green font-semibold hover:bg-brand-green/10">Open account</button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {summary?.suspiciousIps.length > 0 && (
        <Panel>
          <div className="flex items-center gap-2 text-sm font-bold text-red-500"><AlertOctagon className="w-4 h-4" /> Needs attention</div>
          <p className={`mt-1 text-xs ${muted}`}>These addresses failed to sign in 5 or more times in the last 24 hours. Someone may be guessing a password.</p>
          <ul className="mt-3 space-y-1.5 text-xs font-numbers">
            {summary.suspiciousIps.map((i) => (
              <li key={i.ip} className="flex items-center justify-between gap-3">
                <span className="font-bold">{i.ip}</span>
                <span className="text-red-500">{i.failedLogins} failed sign-ins · last {dateTime(i.lastAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Risk">
            <select className={field} value={filters.risk} onChange={(e) => { setOffset(0); setFilters({ ...filters, risk: e.target.value }); }}>
              <option value="">All risk levels</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
            </select>
          </Field>
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
                  {['Time', 'Risk', 'Action', 'Company', 'By', 'Details', 'IP'].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y font-numbers ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {data?.logs.length === 0 && <tr><td colSpan={7} className={`py-10 text-center ${muted}`}>Nothing matches.</td></tr>}
                {data?.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-4 whitespace-nowrap">{dateTime(l.createdAt)}</td>
                    <td className="py-3 px-4"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${RISK[l.risk]?.badge}`}>{l.risk}</span></td>
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
