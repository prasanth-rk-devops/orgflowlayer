import { useState } from 'react';
import { api, tokenStore } from '../api';
import { useAuth } from '../auth';
import { ErrorNote, Field } from '../components/ui';

export default function Account() {
  const { user } = useAuth();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); setOk('');
    try {
      const res = await api('/auth/change-password', { method: 'POST', body: f });
      if (res?.token) tokenStore.set(res.token); // old sessions are revoked; keep this one signed in
      setOk('Password updated. Other devices have been signed out.'); setF({ currentPassword: '', newPassword: '' }); }
    catch (err) { setError(err.message); }
  };

  return (
    <>
      <h1>Account</h1>
      <section className="panel narrow">
        <p><b>{user.email}</b><br /><span className="muted">{user.jobTitle || 'No job title'} · {user.role}</span></p>
        <h2>Change password</h2>
        <form onSubmit={submit} className="stack">
          <ErrorNote error={error} />{ok && <div className="notice">{ok}</div>}
          <Field label="Current password"><input type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="New password"><input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required minLength={8} autoComplete="new-password" placeholder="8+ chars, 1 capital, 1 number" /></Field>
          <button className="primary">Update password</button>
        </form>
      </section>
    </>
  );
}
