import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Field } from '../components/ui';
import AuthShell from '../components/AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try { await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } }); setDone(true); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <form className="login" onSubmit={submit}>
        <h1>Choose a new password</h1>
        {!token && <div className="alert">This link is missing its token. Request a new one.</div>}
        <ErrorNote error={error} />
        {done ? <div className="notice">Password updated. You can sign in now.</div> : (
          <>
            <Field label="New password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="8+ chars, 1 capital, 1 number" /></Field>
            <Field label="Repeat password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></Field>
            <button className="primary" disabled={busy || !token}>{busy ? 'Saving…' : 'Update password'}</button>
          </>
        )}
        <Link to={done ? '/login' : '/forgot-password'}>{done ? 'Go to sign in' : 'Request a new link'}</Link>
      </form>
    </AuthShell>
  );
}
