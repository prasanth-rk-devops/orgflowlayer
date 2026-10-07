import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api';
import Avatar from '../components/Avatar';
import ImportEmployees from '../components/ImportEmployees';
import { useAuth } from '../auth';
import { Badge, Empty, ErrorNote, Field, Modal } from '../components/ui';

const blank = { firstName: '', lastName: '', email: '', phone: '', jobTitle: '', departmentId: '', managerId: '',
  hireDate: new Date().toISOString().slice(0, 10), salary: '', createLogin: false, password: '', role: 'employee' };

export default function Employees() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [filters, setFilters] = useState({ search: '', departmentId: '', status: 'active' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | employee
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page, limit: 15 });
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    api(`/employees?${p}`).then((r) => { setRows(r.data); setMeta(r); setError(''); }).catch((e) => setError(e.message));
  }, [filters, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api('/departments').then(setDepartments).catch(() => {});
    api('/employees?status=active&limit=100').then((r) => setManagers(r.data)).catch(() => {});
  }, []);

  const deactivate = async (e) => {
    if (!window.confirm(`Deactivate ${e.firstName} ${e.lastName}? They will no longer be able to sign in.`)) return;
    try { await api(`/employees/${e.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };

  const setFilter = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        {isAdmin && (
          <div className="head-actions">
            <button onClick={() => setImporting(true)}>Import CSV</button>
            <button onClick={() => downloadFile('/employees/export.csv', 'employees.csv').catch((e) => setError(e.message))}>Export CSV</button>
            <button className="primary" onClick={() => setEditing('new')}>Add employee</button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <input placeholder="Search name, email or title" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
        <select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="">All</option>
        </select>
      </div>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Department</th><th>Manager</th><th>Hired</th>{isAdmin && <th>Salary</th>}<th>Status</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td><div className="who-cell"><Avatar name={`${e.firstName} ${e.lastName}`} size={34} /><div><Link className="name-link" to={`/employees/${e.id}`}>{e.firstName} {e.lastName}</Link><div className="muted small">{e.email}</div></div></div></td>
                <td>{e.jobTitle}</td><td>{e.departmentName || '—'}</td><td>{e.managerName || '—'}</td><td>{e.hireDate}</td>
                {isAdmin && <td>{e.salary != null ? e.salary.toLocaleString() : '—'}</td>}
                <td><Badge status={e.status} /></td>
                {isAdmin && <td className="actions">
                  <button className="link" onClick={() => setEditing(e)}>Edit</button>
                  {e.status === 'active' && <button className="link danger" onClick={() => deactivate(e)}>Deactivate</button>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No one matches these filters.</Empty>}
      </div>
      <div className="pager">
        <span className="muted">{meta.total} people</span>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {meta.page} of {meta.totalPages || 1}</span>
        <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>

      {importing && <ImportEmployees onClose={() => setImporting(false)} onDone={load} />}
      {editing && <EmployeeForm employee={editing === 'new' ? null : editing} departments={departments} managers={managers}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function EmployeeForm({ employee, departments, managers, onClose, onSaved }) {
  const isNew = !employee;
  const [f, setF] = useState(isNew ? blank : { ...blank, ...employee, departmentId: employee.departmentId ?? '', managerId: employee.managerId ?? '',
    phone: employee.phone ?? '', salary: employee.salary ?? '', role: employee.role || 'employee' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = {
      firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone || null, jobTitle: f.jobTitle,
      departmentId: f.departmentId ? Number(f.departmentId) : null, managerId: f.managerId ? Number(f.managerId) : null,
      hireDate: f.hireDate, salary: f.salary === '' ? null : Number(f.salary),
    };
    if (isNew) Object.assign(body, { createLogin: f.createLogin, role: f.role, ...(f.createLogin ? { password: f.password } : {}) });
    else if (employee.hasLogin) body.role = f.role;
    try {
      await api(isNew ? '/employees' : `/employees/${employee.id}`, { method: isNew ? 'POST' : 'PUT', body });
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add employee' : `Edit ${employee.firstName} ${employee.lastName}`} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <ErrorNote error={error} />
        <Field label="First name"><input value={f.firstName} onChange={set('firstName')} required /></Field>
        <Field label="Last name"><input value={f.lastName} onChange={set('lastName')} required /></Field>
        <Field label="Work email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Job title"><input value={f.jobTitle} onChange={set('jobTitle')} required /></Field>
        <Field label="Hire date"><input type="date" value={f.hireDate} onChange={set('hireDate')} required /></Field>
        <Field label="Department">
          <select value={f.departmentId} onChange={set('departmentId')}><option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Field>
        <Field label="Reports to">
          <select value={f.managerId} onChange={set('managerId')}><option value="">No manager</option>
            {managers.filter((m) => m.id !== employee?.id).map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</select>
        </Field>
        <Field label="Annual salary"><input type="number" min="0" step="0.01" value={f.salary} onChange={set('salary')} /></Field>
        {(isNew || employee.hasLogin) && (
          <Field label="Access level">
            <select value={f.role} onChange={set('role')}><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option></select>
          </Field>
        )}
        {isNew && (
          <>
            <label className="check full"><input type="checkbox" checked={f.createLogin} onChange={set('createLogin')} /> Create a sign-in for this person</label>
            {f.createLogin && <Field label="Temporary password"><input type="password" value={f.password} onChange={set('password')} minLength={8} required autoComplete="new-password" placeholder="8+ chars, 1 capital, 1 number" /></Field>}
          </>
        )}
        <div className="form-actions full">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save employee'}</button>
        </div>
      </form>
    </Modal>
  );
}
