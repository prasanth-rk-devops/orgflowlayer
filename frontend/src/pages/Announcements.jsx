import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import Icon from '../components/Icon';
import { Empty, ErrorNote, Field } from '../components/ui';

const stamp = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export default function Announcements() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [f, setF] = useState({ title: '', body: '', pinned: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api('/announcements?limit=50').then(setRows).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  const publish = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/announcements', { method: 'POST', body: f }); setF({ title: '', body: '', pinned: false }); toast.success('Announcement published'); load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const togglePin = async (n) => {
    try { await api(`/announcements/${n.id}`, { method: 'PATCH', body: { pinned: !n.pinned } }); toast.success(n.pinned ? 'Unpinned' : 'Pinned to the top'); load(); }
    catch (err) { toast.error(err.message); }
  };
  const remove = async (n) => {
    if (!window.confirm(`Delete "${n.title}"?`)) return;
    try { await api(`/announcements/${n.id}`, { method: 'DELETE' }); toast.success('Announcement deleted'); load(); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Announcements</h1><p className="muted">News and notices from People Operations.</p></div></div>
      <ErrorNote error={error} />
      <div className="grid-main wide-left">
        <section>
          {rows.length === 0 ? <div className="panel"><Empty>Nothing has been posted yet.</Empty></div> : (
            <ul className="articles">{rows.map((n) => (
              <li key={n.id} className="article">
                <div className="article-head">
                  <h2>{n.pinned && <span className="pin" title="Pinned"><Icon name="pin" size={15} /></span>}{n.title}</h2>
                  {isAdmin && (
                    <span className="article-actions">
                      <button className="ghost small" onClick={() => togglePin(n)}><Icon name="pin" size={15} /> {n.pinned ? 'Unpin' : 'Pin'}</button>
                      <button className="ghost small danger" onClick={() => remove(n)}><Icon name="trash" size={15} /> Delete</button>
                    </span>)}
                </div>
                <p>{n.body}</p>
                <small className="muted">Posted by {n.authorName} on {stamp(n.createdAt)}</small>
              </li>))}
            </ul>
          )}
        </section>

        {isAdmin && (
          <aside className="panel sticky">
            <div className="panel-head"><h2>Post an announcement</h2></div>
            <form onSubmit={publish} className="stack">
              <Field label="Headline"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={120} /></Field>
              <Field label="Message"><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required maxLength={2000} /></Field>
              <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Keep at the top</label>
              <button className="primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish announcement'}</button>
            </form>
          </aside>
        )}
      </div>
    </>
  );
}
