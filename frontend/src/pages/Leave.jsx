import { useCallback, useEffect, useState } from 'react';
import { api, uploadFile } from '../api';
import Attachments from '../components/Attachments';
import { Badge, Empty, ErrorNote, Field } from '../components/ui';

export default function Leave() {
  const [balance, setBalance] = useState([]);
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [file, setFile] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ leaveTypeId: '', startDate: today, endDate: today, reason: '' });

  const load = useCallback(() => {
    Promise.all([api('/leave/balance'), api('/leave'), api('/leave/types')])
      .then(([b, r, t]) => { setBalance(b); setRows(r); setTypes(t); setF((x) => ({ ...x, leaveTypeId: x.leaveTypeId || t[0]?.id || '' })); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setOk('');
    try {
      const created = await api('/leave', { method: 'POST', body: { ...f, leaveTypeId: Number(f.leaveTypeId), reason: f.reason || null } });
      if (file) {
        try { await uploadFile(`/leave/${created.id}/attachments`, file); }
        catch (upErr) { setError(`Request sent, but the file was not attached: ${upErr.message}`); }
      }
      setOk('Request sent to your manager.'); setF({ ...f, reason: '' }); setFile(null); e.target.reset?.(); load();
    } catch (err) { setError(err.message); }
  };

  const cancel = async (id) => {
    try { await api(`/leave/${id}/cancel`, { method: 'PATCH' }); load(); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h1>My leave</h1>
      <div className="stats">
        {balance.map((b) => (
          <div className="stat" key={b.leaveTypeId}>
            <b>{b.remaining}</b><span>{b.name} days left in {b.year}</span>
            <small className="muted">{b.used} used · {b.pending} pending of {b.annualDays}</small>
          </div>
        ))}
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Request time off</h2>
          <form onSubmit={submit} className="stack">
            <ErrorNote error={error} />
            {ok && <div className="notice">{ok}</div>}
            <Field label="Type"><select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <div className="two">
              <Field label="From"><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required /></Field>
              <Field label="To"><input type="date" min={f.startDate} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required /></Field>
            </div>
            <Field label="Reason (optional)"><textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={500} /></Field>
            <Field label="Attach a document (optional)">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files[0] || null)} />
            </Field>
            <p className="muted small">Weekends are not counted. PDF, PNG or JPG, up to 5 MB.</p>
            <button className="primary">Send request</button>
          </form>
        </section>

        <section className="panel">
          <h2>History</h2>
          {rows.length === 0 ? <Empty>You haven't requested any leave yet.</Empty> : (
            <ul className="plain">{rows.map((r) => (
              <li key={r.id} className="row">
                <div><b>{r.leaveType}</b> · {r.days} day{r.days > 1 ? 's' : ''}<div className="muted small">{r.startDate} to {r.endDate}</div>
                  {r.reviewNote && <div className="small">Note: {r.reviewNote}</div>}
                  <Attachments requestId={r.id} files={r.attachments} onError={setError}
                    onRemove={r.status === 'pending' ? async (f) => {
                      try { await api(`/leave/${r.id}/attachments/${f.id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
                    } : undefined} /></div>
                <div className="right"><Badge status={r.status} />
                  {r.status === 'pending' && <button className="link danger" onClick={() => cancel(r.id)}>Cancel</button>}</div>
              </li>))}</ul>
          )}
        </section>
      </div>
    </>
  );
}
