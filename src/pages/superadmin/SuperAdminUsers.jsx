import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Search, Users } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime } from '../../services/format';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const ROLES = { SUPER_ADMIN: 'Platform owner', COMPANY_ADMIN: 'Company owner', DISPATCHER: 'Dispatcher', DRIVER: 'Driver' };

export default function SuperAdminUsers() {
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState(null);
  const [ef, setEf] = useState({ name: '', email: '', phone: '' });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const startEdit = (u) => { setEditing(u); setEf({ name: u.name || '', email: u.email || '', phone: u.phone || '' }); setEditError(''); };
  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditError('');
    try {
      const body = { name: ef.name.trim(), phone: ef.phone.trim() || null };
      if (ef.email.trim()) body.email = ef.email.trim().toLowerCase();
      await api(`/admin/users/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(errorMessage(err, 'Could not save the changes.'));
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v.trim() && q.set(k, v.trim()));
    try {
      setUsers((await api(`/admin/users?${q}`)).users);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the users.'));
    }
  }, [filters]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (u, status) => {
    if (status === 'disabled' && !window.confirm(`Block ${u.name}? They will be signed out and cannot sign in until you open the account again.`)) return;
    setBusyId(u.id);
    try {
      await api(`/admin/users/${u.id}/status`, { method: 'POST', body: { status } });
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not change this account.'));
    } finally {
      setBusyId('');
    }
  };

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Users} title="Users" subtitle="Everyone on the platform: company owners, dispatchers and drivers. Find a person, see their company, block or open their account." />
      <ErrorBanner message={error} />
      <Panel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Search">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={`${field} pl-9`} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name, email, phone or company" />
            </div>
          </Field>
          <Field label="Role">
            <select className={field} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
              <option value="">All roles</option>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={field} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="disabled">Blocked</option>
            </select>
          </Field>
        </div>
      </Panel>
      <Panel className="p-0 overflow-hidden">
        {!users && !error ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Name', 'Role', 'Company', 'Contact', 'Last sign-in', 'Status', ''].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {users?.length === 0 && <tr><td colSpan={7} className={`py-10 text-center ${muted}`}>No one matches.</td></tr>}
                {users?.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4 font-bold">{u.name}</td>
                    <td className="py-3 px-4">{ROLES[u.role] || u.role}</td>
                    <td className="py-3 px-4">{u.companyName || '—'}</td>
                    <td className={`py-3 px-4 ${muted}`}>{u.email || '—'}{u.phone ? ` · ${u.phone}` : ''}</td>
                    <td className={`py-3 px-4 whitespace-nowrap ${muted}`}>{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                    <td className="py-3 px-4">
                      {u.status === 'active'
                        ? <span className="px-2 py-0.5 rounded-full border border-brand-green/40 bg-brand-green/15 text-brand-green text-[10px] font-bold uppercase">Active</span>
                        : <span className="px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/15 text-red-500 text-[10px] font-bold uppercase">{u.blocked ? 'Auto-blocked' : 'Blocked'}</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button type="button" onClick={() => startEdit(u)} aria-label={`Edit ${u.name}`} className="no-3d mr-2 px-2.5 py-1.5 rounded-lg border border-gray-500/30 hover:text-brand-green"><Pencil className="w-3.5 h-3.5 inline" /></button>
                      {u.role !== 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setStatus(u, u.status === 'active' ? 'disabled' : 'active')}
                          className={`no-3d px-3 py-1.5 rounded-lg border font-semibold disabled:opacity-50 ${u.status === 'active' ? 'border-red-500/40 text-red-500 hover:bg-red-500/10' : 'border-brand-green/40 text-brand-green hover:bg-brand-green/10'}`}
                        >
                          {u.status === 'active' ? 'Block' : 'Open account'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <ErrorBanner message={editError} />
            <Field label="Name *"><input required minLength={2} className={field} value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} /></Field>
            <Field label="Email"><input type="email" className={field} value={ef.email} onChange={(e) => setEf({ ...ef, email: e.target.value })} /></Field>
            <Field label="Phone"><input className={field} value={ef.phone} onChange={(e) => setEf({ ...ef, phone: e.target.value })} /></Field>
            <button type="submit" disabled={saving} className={`${primaryButton} w-full justify-center`}>{saving ? 'Saving…' : 'Save changes'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
