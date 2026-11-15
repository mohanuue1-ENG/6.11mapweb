import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api, errorMessage, setAccessToken } from '../../services/api';
import { ErrorBanner, Field, Modal, primaryButton, useFieldClass } from './ui';

// A signed-in user changes their own password. The server closes their other sessions and
// answers with a fresh token for this one, which is stored so nothing else is interrupted.
export default function ChangePasswordModal({ onClose }) {
  const field = useFieldClass();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== repeat) return setError('The two new passwords do not match.');
    if (next === current) return setError('Choose a password different from the current one.');
    setSaving(true);
    try {
      const res = await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setAccessToken(res.accessToken);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-brand-green/40 bg-brand-green/10 text-sm">
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p>Your password was changed. You were signed out of your other devices.</p>
          </div>
          <div className="flex justify-end"><button type="button" onClick={onClose} className={primaryButton}>Done</button></div>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label="Current password"><input type="password" required autoComplete="current-password" className={field} value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="New password (at least 8 characters)"><input type="password" required minLength={8} autoComplete="new-password" className={field} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Repeat new password"><input type="password" required autoComplete="new-password" className={field} value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs rounded-xl border border-line text-mute hover:text-ink">Cancel</button>
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
