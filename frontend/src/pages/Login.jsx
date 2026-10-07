import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote, Field } from '../components/ui';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(email, password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <form className="login" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your work email.</p>
        <ErrorNote error={error} />
        <Field label="Work email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/forgot-password" className="small">Forgot your password?</Link>
      </form>
    </AuthShell>
  );
}
