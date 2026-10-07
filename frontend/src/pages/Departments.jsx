import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorNote, Field, Modal } from '../components/ui';

export default function Departments() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => { api('/departments').then(setRows).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  const remove = async (d) => {
    if (!window.confirm(`Delete the ${d.name} department?`)) return;
    try { await api(`/departments/${d.id}`, { method: 'DELETE' }); setError(''); load(); } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="page-head"><h1>Departments</h1>
        {isAdmin && <button className="primary" onClick={() => setEditing({ name: '', description: '' })}>Add department</button>}
      </div>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Description</th><th>People</th>{isAdmin && <th />}</tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id}><td><b>{d.name}</b></td><td>{d.description || '—'}</td><td>{d.employeeCount}</td>
              {isAdmin && <td className="actions"><button className="link" onClick={() => setEditing(d)}>Edit</button>
                <button className="link danger" onClick={() => remove(d)}>Delete</button></td>}
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <Empty>No departments yet. Add the first one to start organising people.</Empty>}
      </div>
      {editing && <DeptForm dept={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function DeptForm({ dept, onClose, onSaved }) {
  const [f, setF] = useState({ name: dept.name, description: dept.description || '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(dept.id ? `/departments/${dept.id}` : '/departments', { method: dept.id ? 'PUT' : 'POST', body: f });
      onSaved();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={dept.id ? 'Edit department' : 'Add department'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <ErrorNote error={error} />
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
        <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="form-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save department</button></div>
      </form>
    </Modal>
  );
}
