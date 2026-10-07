import { useEffect, useState } from 'react';
import { api } from '../api';
import { Empty, ErrorNote } from '../components/ui';

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/audit?limit=100').then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <h1>Activity log</h1>
      <p className="muted">The latest 100 changes made by people in your organisation.</p>
      <ErrorNote error={error} />
      <div className="table-wrap"><table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.userEmail || 'deleted user'}</td>
            <td>{r.action}</td><td>{r.entity} #{r.entityId ?? '—'}</td></tr>))}</tbody>
      </table>{rows.length === 0 && <Empty>No activity recorded yet.</Empty>}</div>
    </>
  );
}
