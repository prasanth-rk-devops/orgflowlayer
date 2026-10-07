import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Field } from '../components/ui';
import AuthShell from '../components/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api('/auth/forgot-password', { method: 'POST', body: { email } }); setDone(r.message); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <form className="login" onSubmit={submit}>
        <h1>Forgot password</h1>
        <p className="muted">Enter your work email and we'll send you a link to choose a new password.</p>
        <ErrorNote error={error} />
        {done ? <div className="notice">{done}</div> : (
          <>
            <Field label="Work email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <Link to="/login">Back to sign in</Link>
      </form>
    </AuthShell>
  );
}
