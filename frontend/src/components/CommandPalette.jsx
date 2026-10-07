import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Avatar from './Avatar';
import Icon from './Icon';

const PAGES = [
  { label: 'Overview', to: '/', icon: 'home', words: 'home dashboard' },
  { label: 'Announcements', to: '/announcements', icon: 'megaphone', words: 'news notices' },
  { label: 'People', to: '/employees', icon: 'users', words: 'employees directory staff' },
  { label: 'Org chart', to: '/org-chart', icon: 'sitemap', words: 'hierarchy reporting structure' },
  { label: 'Departments', to: '/departments', icon: 'building', words: 'teams' },
  { label: 'My leave', to: '/leave', icon: 'suitcase', words: 'vacation holiday time off request balance' },
  { label: 'Team calendar', to: '/calendar', icon: 'calendar', words: 'who is out schedule' },
  { label: 'Holidays', to: '/holidays', icon: 'flag', words: 'public bank closed' },
  { label: 'Approvals', to: '/approvals', icon: 'approve', words: 'review requests pending', roles: ['admin', 'manager'] },
  { label: 'Reports', to: '/reports', icon: 'chart', words: 'analytics statistics insights', roles: ['admin'] },
  { label: 'Activity log', to: '/audit', icon: 'activity', words: 'audit history changes', roles: ['admin'] },
  { label: 'Account and password', to: '/account', icon: 'user', words: 'profile settings change password' },
];

/** Ctrl/Cmd+K: jump to any page or person without touching the mouse. */
export default function CommandPalette({ role, onClose }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPeople([]); return undefined; }
    let stale = false;
    const t = setTimeout(() => {
      api(`/employees?search=${encodeURIComponent(term)}&status=active&limit=6`)
        .then((r) => { if (!stale) setPeople(r.data); }).catch(() => {});
    }, 180);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !p.roles || p.roles.includes(role))
      .filter((p) => !term || `${p.label} ${p.words}`.toLowerCase().includes(term)).slice(0, term ? 5 : 12)
      .map((p) => ({ key: p.to, kind: 'page', label: p.label, icon: p.icon, to: p.to }));
    const folks = people.map((p) => ({ key: `p${p.id}`, kind: 'person', label: `${p.firstName} ${p.lastName}`, sub: p.jobTitle, to: `/employees/${p.id}` }));
    return [...pages, ...folks];
  }, [q, people, role]);

  useEffect(() => { setActive(0); }, [results.length, q]);

  const pick = (r) => { if (r) { onClose(); nav(r.to); } };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
  };

  return (
    <div className="backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search people or jump to a page" role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pal-${results[active].key}` : undefined} autoComplete="off" />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox">
          {results.length === 0 && <li className="palette-empty">Nothing matches "{q}".</li>}
          {results.map((r, i) => (
            <li key={r.key} id={`pal-${r.key}`} role="option" aria-selected={i === active}
              className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              {r.kind === 'person' ? <Avatar name={r.label} size={28} /> : <span className="pal-icon"><Icon name={r.icon} size={16} /></span>}
              <span>{r.label}{r.sub && <small>{r.sub}</small>}</span>
              <em>{r.kind === 'person' ? 'Person' : 'Page'}</em>
            </li>))}
        </ul>
      </div>
    </div>
  );
}
