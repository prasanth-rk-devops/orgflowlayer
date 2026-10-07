import { useState } from 'react';
import { api, downloadFile } from '../api';
import { useToast } from '../toast';
import { Modal, ErrorNote } from './ui';

/** Upload a CSV, check it (nothing is saved), fix any listed problems, then import. */
export default function ImportEmployees({ onClose, onDone }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (e) => {
    const f = e.target.files[0];
    setResult(null); setError('');
    if (!f) return;
    if (f.size > 900000) { setError('That file is larger than 900 KB. Split it into smaller files.'); return; }
    setFileName(f.name); setCsv(await f.text());
  };

  const run = async (dryRun) => {
    setBusy(true); setError('');
    try {
      const r = await api('/employees/import', { method: 'POST', body: { csv, dryRun } });
      setResult(r);
      if (!dryRun && r.created > 0) { toast.success(`${r.created} ${r.created === 1 ? 'person' : 'people'} added`); onDone(); }
    } catch (e) { setError(e.message); setResult(null); } finally { setBusy(false); }
  };

  const ok = result && result.errors.length === 0;

  return (
    <Modal title="Import people from CSV" onClose={onClose}>
      <div className="stack">
        <p className="muted">Add many people at once. Required columns: <b>first_name, last_name, email, job_title, hire_date</b> (YYYY-MM-DD).
          Optional: department, manager_email, phone, salary. People are added without a sign-in; you can create logins later.</p>
        <p><button className="link" onClick={() => downloadFile('/employees/import-template.csv', 'employee-import-template.csv').catch((e) => setError(e.message))}>Download the template</button></p>
        <input type="file" accept=".csv,text/csv" onChange={choose} aria-label="CSV file" />
        <ErrorNote error={error} />

        {result && ok && (
          <div className="notice">{result.dryRun
            ? `Looks good: ${result.valid} ${result.valid === 1 ? 'person' : 'people'} ready to import.`
            : `Done: ${result.created} added.`}</div>
        )}
        {result && !ok && (
          <div>
            <div className="alert">{result.errors.length} {result.errors.length === 1 ? 'problem' : 'problems'} found. Nothing has been imported. Fix the file and check again.</div>
            <div className="table-wrap import-errors"><table>
              <thead><tr><th>Row</th><th>Problem</th></tr></thead>
              <tbody>{result.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}

        <div className="form-actions">
          <button onClick={onClose}>{result && result.created ? 'Close' : 'Cancel'}</button>
          <button onClick={() => run(true)} disabled={!csv || busy}>{busy ? 'Checking…' : 'Check file'}</button>
          <button className="primary" onClick={() => run(false)} disabled={!csv || busy || !(ok && result.dryRun)}>
            {fileName ? `Import ${result?.valid ?? ''} ${result?.valid === 1 ? 'person' : 'people'}`.replace('  ', ' ') : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
