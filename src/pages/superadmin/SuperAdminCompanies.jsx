import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Copy, CreditCard, PlusCircle, Power, PowerOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, money } from '../../services/format';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const STATUS_STYLE = {
  active: 'bg-brand-green/15 text-brand-green',
  suspended: 'bg-red-500/15 text-red-500',
  pending: 'bg-amber-500/15 text-amber-500',
};

function PlanModal({ company, plans, onClose, onSaved }) {
  const field = useFieldClass();
  const usable = plans.filter((p) => p.isActive && (!p.isInternalOnly || company.isInternal));
  const [planId, setPlanId] = useState(usable[0]?.id || '');
  const [status, setStatus] = useState('active');
  const [periodEnd, setPeriodEnd] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { planId, status };
      if (periodEnd) body.currentPeriodEnd = new Date(`${periodEnd}T23:59:59`).toISOString();
      await api(`/admin/companies/${company.id}/subscription`, { method: 'PUT', body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the plan.'));
      setSaving(false);
    }
  };

  return (
    <Modal title={`Plan for ${company.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <ErrorBanner message={error} />
        {usable.length === 0 ? (
          <p className="text-xs text-gray-400">No active plan exists yet. Create one under Plans first.</p>
        ) : (
          <>
            <Field label="Plan">
              <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {usable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.priceCents)}/mo · {p.truckLimit == null ? 'unlimited trucks' : `${p.truckLimit} trucks`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subscription status">
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
                {['active', 'trialing', 'past_due', 'suspended'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Current period ends (optional — default 30 days, none for the internal company)">
              <input type="date" className={field} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-white/10 text-gray-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving || !planId} className={primaryButton}>{saving ? 'Saving…' : 'Save plan'}</button>
        </div>
      </form>
    </Modal>
  );
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const generatePassword = () => Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => CHARS[n % CHARS.length]).join('');

// Creates a company and its first administrator. The password is shown once so it can be handed over.
function CreateCompanyModal({ plans, onClose, onCreated }) {
  const field = useFieldClass();
  const [f, setF] = useState({ companyName: '', adminName: '', email: '', password: generatePassword(), phone: '', dotNumber: '', mcNumber: '', address: '', planId: '', isInternal: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const usable = plans.filter((p) => p.isActive && !p.isInternalOnly);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const body = { companyName: f.companyName, adminName: f.adminName, email: f.email, password: f.password };
      for (const k of ['phone', 'dotNumber', 'mcNumber', 'address']) if (f[k]) body[k] = f[k];
      if (f.isInternal) body.isInternal = true;
      const created = await api('/admin/companies', { method: 'POST', body });
      let planError = '';
      if (f.planId && !f.isInternal) {
        try {
          await api(`/admin/companies/${created.companyId}/subscription`, { method: 'PUT', body: { planId: f.planId } });
        } catch (err) {
          planError = errorMessage(err, 'The plan could not be assigned.');
        }
      }
      setDone({ email: f.email, password: f.password, planError });
      onCreated();
    } catch (err) {
      setError(errorMessage(err, 'Could not create the company.'));
      setSaving(false);
    }
  };

  if (done) {
    const text = `Email: ${done.email}
Password: ${done.password}`;
    return (
      <Modal title='Company created' onClose={onClose}>
        <div className='space-y-4 text-sm'>
          <p>Give these sign-in details to the company administrator. The password is shown only now.</p>
          {done.planError && <ErrorBanner message={`Company created, but: ${done.planError} Assign a plan from the list.`} />}
          <pre className='p-3 rounded-xl bg-surface-2 border border-line text-xs whitespace-pre-wrap select-all'>{text}</pre>
          <p className='text-xs text-mute'>There is no password-change screen yet, so keep this password safe or ask the administrator to store it in a password manager.</p>
          <div className='flex justify-end gap-2'>
            <button type='button' onClick={async () => { await navigator.clipboard?.writeText(text).catch(() => {}); setCopied(true); }} className='px-4 py-2 text-xs font-semibold rounded-xl border border-line hover:border-brand-green flex items-center gap-1.5'>
              <Copy className='w-3.5 h-3.5' /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button type='button' onClick={onClose} className={primaryButton}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title='Add company' onClose={onClose}>
      <form onSubmit={save} className='space-y-3'>
        <ErrorBanner message={error} />
        <Field label='Company name *'><input required className={field} value={f.companyName} onChange={set('companyName')} /></Field>
        <div className='grid grid-cols-2 gap-3'>
          <Field label='USDOT number'><input className={`${field} uppercase`} value={f.dotNumber} onChange={set('dotNumber')} /></Field>
          <Field label='MC number'><input className={`${field} uppercase`} value={f.mcNumber} onChange={set('mcNumber')} /></Field>
        </div>
        <Field label='Address'><input className={field} value={f.address} onChange={set('address')} /></Field>
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Administrator name *'><input required className={field} value={f.adminName} onChange={set('adminName')} /></Field>
          <Field label='Phone'><input type='tel' className={field} value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label='Administrator email * (their sign-in)'><input required type='email' className={field} value={f.email} onChange={set('email')} /></Field>
        <Field label='Starting password * (at least 8 characters)'>
          <div className='flex gap-2'>
            <input required minLength={8} className={`${field} font-mono`} value={f.password} onChange={set('password')} autoComplete='off' />
            <button type='button' onClick={() => setF({ ...f, password: generatePassword() })} className='px-3 text-xs font-semibold rounded-xl border border-line hover:border-brand-green whitespace-nowrap'>Generate</button>
          </div>
        </Field>
        <label className='flex items-start gap-2 text-sm'>
          <input type='checkbox' className='mt-1' checked={f.isInternal} onChange={(e) => setF({ ...f, isInternal: e.target.checked, planId: '' })} />
          <span>Internal company (for example NEB Trucking): no fee, uses the internal $0 plan automatically</span>
        </label>
        <Field label='Plan (optional, can be set later)'>
          <select className={field} value={f.planId} onChange={set('planId')} disabled={f.isInternal}>
            <option value=''>No plan yet</option>
            {usable.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.priceCents)}/mo</option>)}
          </select>
        </Field>
        <div className='flex justify-end gap-2 pt-1'>
          <button type='button' onClick={onClose} className='px-4 py-2 text-xs rounded-xl border border-line text-mute hover:text-ink'>Cancel</button>
          <button type='submit' disabled={saving} className={primaryButton}>{saving ? 'Creating…' : 'Create company'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuperAdminCompanies() {
  const { isDark } = useTheme();
  const [companies, setCompanies] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api('/admin/companies'), api('/admin/plans')]);
      setCompanies(c.companies);
      setPlans(p.plans);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load companies.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (company, status) => {
    if (status !== 'active' && !window.confirm(`Suspend ${company.name}? Its admins and drivers are signed out immediately.`)) return;
    try {
      await api(`/admin/companies/${company.id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the company status.'));
    }
  };

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Building2} title="Companies" subtitle="Every company on the platform, its plan and its fleet size">
        <button onClick={() => setCreating(true)} className={primaryButton}><PlusCircle className="w-4 h-4" /> Add company</button>
      </PageHeader>
      <ErrorBanner message={error} />
      <Panel className="p-0 overflow-hidden">
        {!companies && !error ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Company', 'Status', 'Plan', 'Trucks', 'Drivers', 'Registered', ''].map((h) => (
                    <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {companies?.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3.5 px-4">
                      <div className="font-bold">{c.name}{c.isInternal && <span className="ml-2 text-[9px] text-brand-green font-bold uppercase">Internal</span>}</div>
                      <div className={muted}>{c.contactEmail || '—'}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.subscription ? (
                        <>
                          <div className="font-semibold">{c.subscription.planName}</div>
                          <div className={muted}>{money(c.subscription.priceCents)}/mo · {c.subscription.status.replace('_', ' ')}</div>
                        </>
                      ) : (
                        <span className={muted}>No plan</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-numbers">
                      {c.activeTrucks} / {c.subscription?.truckLimit ?? '∞'}
                    </td>
                    <td className="py-3.5 px-4 font-numbers">{c.activeDrivers}</td>
                    <td className={`py-3.5 px-4 font-numbers ${muted}`}>{dateTime(c.createdAt)}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setEditing(c)} title="Change plan" aria-label={`Change plan for ${c.name}`} className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-brand-green">
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        {c.status === 'active' ? (
                          <button onClick={() => setStatus(c, 'suspended')} title="Suspend" aria-label={`Suspend ${c.name}`} className="p-1.5 rounded-lg border border-white/10 text-amber-500 hover:bg-amber-500/10">
                            <PowerOff className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => setStatus(c, 'active')} title="Activate" aria-label={`Activate ${c.name}`} className="p-1.5 rounded-lg border border-white/10 text-brand-green hover:bg-brand-green/10">
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && <CreateCompanyModal plans={plans} onClose={() => setCreating(false)} onCreated={load} />}
      {editing && (
        <PlanModal
          company={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
