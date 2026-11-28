import React, { useEffect, useState } from 'react';
import { UserCog, PlusCircle, Power, PowerOff, Mail, Pencil } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';
import PasswordCreate from '../../components/common/PasswordCreate';
import { assess } from '../../utils/passwordPolicy';

// The owner creates the dispatchers: employees who run the loads and the drivers every day.
export default function Team() {
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Edit: name, email, and a new password (leave the password empty to keep it).
  const [editing, setEditing] = useState(null);
  const [ef, setEf] = useState({ name: '', email: '', password: '', confirm: '' });
  const [editError, setEditError] = useState('');
  const startEdit = (d) => { setEditing(d); setEf({ name: d.name, email: d.email, password: '', confirm: '' }); setEditError(''); };
  const saveEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    const body = { name: ef.name.trim(), email: ef.email.trim().toLowerCase() };
    if (ef.password) {
      const verdict = assess(ef.password, { email: ef.email });
      if (!verdict.ok) return setEditError(verdict.label ? `${verdict.label}. ${verdict.message}` : verdict.message);
      if (ef.password !== ef.confirm) return setEditError('The two passwords do not match.');
      body.password = ef.password;
    }
    setSaving(true);
    try {
      await api(`/team/dispatchers/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      load();
    } catch (err) {
      setEditError(errorMessage(err, 'Could not save the changes.'));
    } finally {
      setSaving(false);
    }
  };
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  const load = () => api('/team/dispatchers').then((r) => setList(r.dispatchers)).catch((e) => setError(errorMessage(e, 'Could not load the team.')));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setFormError('');
    const verdict = assess(f.password, { email: f.email });
    if (!verdict.ok) return setFormError(verdict.label ? `${verdict.label}. ${verdict.message}` : verdict.message);
    if (f.password !== f.confirm) return setFormError('The two passwords do not match.');
    setSaving(true);
    try {
      await api('/team/dispatchers', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password } });
      setOpen(false);
      setF({ name: '', email: '', password: '', confirm: '' });
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create the dispatcher.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (d) => {
    try {
      await api(`/team/dispatchers/${d.id}`, { method: 'PATCH', body: { status: d.status === 'active' ? 'disabled' : 'active' } });
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not change this person.'));
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader icon={UserCog} title="Team" subtitle="Dispatchers are your employees. They run the loads and the drivers every day. You, the owner, manage the company and the plan.">
        <button onClick={() => setOpen(true)} className={primaryButton}><PlusCircle className="w-4 h-4" /> Add dispatcher</button>
      </PageHeader>
      <ErrorBanner message={error} />
      <Panel className="p-0 overflow-hidden">
        {!list ? <Spinner /> : list.length === 0 ? (
          <p className={`py-10 text-center text-sm ${muted}`}>No dispatchers yet. Add the first one: they sign in with their own email and password.</p>
        ) : (
          <ul className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
            {list.map((d) => (
              <li key={d.id} className={`flex items-center justify-between gap-3 px-5 py-4 ${d.status === 'active' ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{d.name}</div>
                  <div className={`text-xs flex items-center gap-1.5 ${muted}`}><Mail className="w-3 h-3" /> {d.email}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${d.status === 'active' ? 'bg-brand-green/15 text-brand-green' : 'bg-gray-500/20 text-gray-400'}`}>{d.status === 'active' ? 'Active' : 'Off'}</span>
                  <button onClick={() => startEdit(d)} aria-label={`Edit ${d.name}`} className={`p-1.5 rounded-lg border ${isDark ? 'border-white/10' : 'border-gray-200'} ${muted} hover:text-brand-green`}><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggle(d)} aria-label={d.status === 'active' ? `Switch off ${d.name}` : `Switch on ${d.name}`} className={`p-1.5 rounded-lg border ${isDark ? 'border-white/10' : 'border-gray-200'} ${muted} hover:text-brand-green`}>
                    {d.status === 'active' ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <ErrorBanner message={editError} />
            <Field label="Name *"><input required minLength={2} className={field} value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} autoComplete="off" /></Field>
            <Field label="Email *"><input required type="email" className={field} value={ef.email} onChange={(e) => setEf({ ...ef, email: e.target.value })} autoComplete="off" /></Field>
            <p className={`text-xs ${muted}`}>New password: leave empty to keep the current one. If you set one, this person is signed out everywhere.</p>
            <PasswordCreate password={ef.password} setPassword={(v) => setEf((x) => ({ ...x, password: v }))} confirm={ef.confirm} setConfirm={(v) => setEf((x) => ({ ...x, confirm: v }))} email={ef.email} />
            <button type="submit" disabled={saving} className={`${primaryButton} w-full justify-center`}>{saving ? 'Saving…' : 'Save changes'}</button>
          </form>
        </Modal>
      )}

      {open && (
        <Modal title="Add dispatcher" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="space-y-3">
            <ErrorBanner message={formError} />
            <Field label="Name *"><input required minLength={2} className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="off" /></Field>
            <Field label="Email *"><input required type="email" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>
            <PasswordCreate password={f.password} setPassword={(v) => setF((x) => ({ ...x, password: v }))} confirm={f.confirm} setConfirm={(v) => setF((x) => ({ ...x, confirm: v }))} email={f.email} />
            <button type="submit" disabled={saving} className={`${primaryButton} w-full justify-center`}>{saving ? 'Creating…' : 'Create dispatcher'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
