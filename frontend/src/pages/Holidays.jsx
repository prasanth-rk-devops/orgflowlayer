import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorNote, Field } from '../components/ui';

export default function Holidays() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [f, setF] = useState({ date: '', name: '' });

  const load = useCallback(() => { api(`/holidays?year=${year}`).then(setRows).catch((e) => setError(e.message)); }, [year]);
  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault(); setError('');
    try { await api('/holidays', { method: 'POST', body: f }); setF({ date: '', name: '' }); setYear(Number(f.date.slice(0, 4))); load(); }
    catch (err) { setError(err.message); }
  };
  const remove = async (h) => {
    if (!window.confirm(`Remove ${h.name}?`)) return;
    try { await api(`/holidays/${h.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };
  const weekday = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });

  return (
    <>
      <div className="page-head"><h1>Company holidays</h1>
        <div className="year-nav"><button onClick={() => setYear(year - 1)}>‹</button><b>{year}</b><button onClick={() => setYear(year + 1)}>›</button></div>
      </div>
      <p className="muted">Holidays are not counted against anyone's leave balance.</p>
      <ErrorNote error={error} />
      <div className="grid2">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Day</th><th>Holiday</th>{isAdmin && <th />}</tr></thead>
            <tbody>{rows.map((h) => (
              <tr key={h.id}><td>{h.date}</td><td>{weekday(h.date)}</td><td><b>{h.name}</b></td>
                {isAdmin && <td className="actions"><button className="link danger" onClick={() => remove(h)}>Remove</button></td>}</tr>))}</tbody>
          </table>
          {rows.length === 0 && <Empty>No holidays added for {year}.</Empty>}
        </div>
        {isAdmin && (
          <section className="panel">
            <h2>Add a holiday</h2>
            <form onSubmit={add} className="stack">
              <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
              <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={100} /></Field>
              <button className="primary">Add holiday</button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
