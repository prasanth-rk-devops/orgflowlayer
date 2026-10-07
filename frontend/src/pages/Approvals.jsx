import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty, ErrorNote } from '../components/ui';
import Attachments from '../components/Attachments';

export default function Approvals() {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});

  const load = useCallback(() => {
    api(`/leave?scope=team&status=${status}`).then((r) => { setRows(r); setError(''); }).catch((e) => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const decide = async (id, decision) => {
    try { await api(`/leave/${id}/review`, { method: 'PATCH', body: { decision, note: notes[id] || null } }); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="page-head"><h1>Approvals</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Waiting for a decision</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select></div>
      {user.role === 'admin' && (
        <p><button onClick={() => downloadFile(`/leave/export.csv?year=${new Date().getFullYear()}`, `leave-${new Date().getFullYear()}.csv`).catch((e) => setError(e.message))}>
          Export {new Date().getFullYear()} leave report (CSV)</button></p>
      )}
      <p className="muted">{user.role === 'admin' ? 'Showing requests from everyone who has a manager.' : 'Showing requests from people who report to you.'}</p>
      <ErrorNote error={error} />
      {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>{status === 'pending' ? 'Decision' : 'Status'}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.employeeName}</b></td><td>{r.leaveType}</td><td>{r.startDate} to {r.endDate}</td><td>{r.days}</td><td>{r.reason || '—'}<Attachments requestId={r.id} files={r.attachments} onError={setError} /></td>
              <td>{r.status === 'pending' ? (
                <div className="decide">
                  <input placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <button className="primary" onClick={() => decide(r.id, 'approved')}>Approve</button>
                  <button className="danger-btn" onClick={() => decide(r.id, 'rejected')}>Reject</button>
                </div>) : <Badge status={r.status} />}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
