import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Inbox, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, money } from '../../services/format';
import { ErrorBanner, Field, Modal, PageHeader, Panel, Spinner, primaryButton, useFieldClass } from '../../components/common/ui';

const STATUS_STYLE = {
  pending: 'bg-amber-500/15 text-amber-500',
  approved: 'bg-brand-green/15 text-accent',
  rejected: 'bg-red-500/15 text-red-500',
  paid: 'bg-brand-green/15 text-accent',
  awaiting_payment: 'bg-blue-500/15 text-blue-500',
  expired: 'bg-gray-500/15 text-gray-400',
};
const STATUS_LABEL = { awaiting_payment: 'awaiting payment' };

function ApproveModal({ request, plans, onClose, onDone }) {
  const field = useFieldClass();
  const usable = plans.filter((p) => p.isActive && !p.isInternalOnly);
  const [planId, setPlanId] = useState(usable[0]?.id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const approve = async () => {
    setSaving(true);
    setError('');
    try {
      setResult(await api(`/admin/registration-requests/${request.id}/approve`, { method: 'POST', body: planId ? { planId } : {} }));
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not approve this request.'));
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Modal title="Company approved" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>
            <span className="font-semibold">{request.companyName}</span> is created.{' '}
            {result.passwordChosen ? `They chose their password when they created the account, so they can sign in with ${request.email} now.${result.emailSent ? ' We emailed them.' : ''}` : result.emailSent ? `An email with the sign-in link was sent to ${request.email}.` : 'Email is not set up, so send this link to them yourself:'}
          </p>
          {!result.emailSent && result.inviteUrl && (
            <>
              <pre className="p-3 rounded-xl bg-surface-2 border border-line text-xs whitespace-pre-wrap break-all select-all">{result.inviteUrl}</pre>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(result.inviteUrl).catch(() => {});
                  setCopied(true);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-line hover:border-brand-green flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <p className="text-xs text-mute">The link works once and expires in 7 days. It lets them choose their own password.</p>
            </>
          )}
          {result.trialDays ? <p className="text-mute">Their {result.trialDays}-day free trial has started.</p> : <p className="text-mute">No plan was chosen, so there is no trial period or truck limit.</p>}
          <div className="flex justify-end"><button type="button" onClick={onClose} className={primaryButton}>Done</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Approve ${request.companyName}`} onClose={onClose}>
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <p className="text-sm text-mute">
          This creates the company and its administrator ({request.contactName}, {request.email}) and emails them a link to choose their password.
        </p>
        <Field label="Plan for the free trial">
          <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">No plan (no trial, no truck limit)</option>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {money(p.priceCents)}/mo · {p.truckLimit == null ? 'unlimited trucks' : `${p.truckLimit} trucks`}</option>
            ))}
          </select>
        </Field>
        {usable.length === 0 && <p className="text-xs text-amber-500">No plan exists yet. Create one under Plans to give new companies a trial.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-line text-mute hover:text-ink">Cancel</button>
          <button type="button" onClick={approve} disabled={saving} className={primaryButton}>{saving ? 'Approving…' : 'Approve and send link'}</button>
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const field = useFieldClass();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reject = async () => {
    setSaving(true);
    try {
      await api(`/admin/registration-requests/${request.id}/reject`, { method: 'POST', body: note.trim() ? { note } : {} });
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not reject this request.'));
      setSaving(false);
    }
  };

  return (
    <Modal title={`Reject ${request.companyName}`} onClose={onClose}>
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Field label="Note for your records (optional)">
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <p className="text-xs text-mute">The company is not told automatically. They can send a new request later.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-line text-mute hover:text-ink">Cancel</button>
          <button type="button" onClick={reject} disabled={saving} className="px-4 py-2 text-xs font-bold rounded-xl bg-status-red text-white hover:opacity-90 disabled:opacity-60">{saving ? 'Rejecting…' : 'Reject request'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function SuperAdminRequests() {
  const { isDark } = useTheme();
  const [requests, setRequests] = useState(null);
  const [plans, setPlans] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([api(`/admin/registration-requests${filter === 'all' ? '' : `?status=${filter}`}`), api('/admin/plans')]);
      setRequests(r.requests);
      setPlans(p.plans);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load requests.'));
    }
  }, [filter]);

  useEffect(() => {
    setRequests(null);
    load();
  }, [load]);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Inbox} title="Access requests" subtitle="Companies that asked to join. Approve to create their account and start their free trial." />
      <ErrorBanner message={error} />

      <div role="tablist" className="inline-flex p-1 rounded-xl border border-line bg-surface-2 text-xs font-semibold">
        {[['pending', 'Pending'], ['paid', 'Paid sign-ups'], ['approved', 'Approved'], ['awaiting_payment', 'Awaiting payment'], ['all', 'All']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`px-4 py-1.5 rounded-lg transition-colors ${filter === id ? 'bg-surface text-accent shadow-sm' : 'text-mute hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <Panel className="p-0 overflow-hidden">
        {!requests && !error ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider ${isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {['Company', 'Contact', 'Message', 'Received', 'Status', ''].map((h) => <th key={h} className="py-3.5 px-4 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {requests?.length === 0 && <tr><td colSpan={6} className={`py-10 text-center ${muted}`}>{filter === 'pending' ? 'No requests waiting. New ones appear here.' : 'Nothing here.'}</td></tr>}
                {requests?.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3.5 px-4">
                      <div className="font-bold">{r.companyName}</div>
                      <div className={muted}>{[r.dotNumber && `USDOT ${r.dotNumber}`, r.mcNumber && `MC ${r.mcNumber}`].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold">{r.contactName}</div>
                      <div className={muted}>{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
                    </td>
                    <td className={`py-3.5 px-4 max-w-xs ${muted}`}>{r.message || '—'}</td>
                    <td className={`py-3.5 px-4 font-numbers ${muted}`}>{dateTime(r.createdAt)}</td>
                    <td className="py-3.5 px-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>{r.planName && <div className={`mt-1 ${muted}`}>{r.planName}</div>}</td>
                    <td className="py-3.5 px-4">
                      {r.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setApproving(r)} className="px-3 py-1.5 rounded-lg bg-brand-green text-[#052E16] font-bold flex items-center gap-1 hover:bg-brand-green-hover"><Check className="w-3.5 h-3.5" /> Approve</button>
                          <button onClick={() => setRejecting(r)} aria-label={`Reject ${r.companyName}`} className="p-1.5 rounded-lg border border-line text-status-red hover:bg-status-red/10"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {approving && <ApproveModal request={approving} plans={plans} onClose={() => setApproving(null)} onDone={load} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); load(); }} />}
    </div>
  );
}
