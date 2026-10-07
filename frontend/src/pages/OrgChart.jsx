import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Empty, ErrorNote } from '../components/ui';

function Node({ person, children, collapsed, toggle }) {
  const kids = children.get(person.id) || [];
  const isCollapsed = collapsed.has(person.id);
  const name = `${person.firstName} ${person.lastName}`;
  return (
    <li>
      <div className="node">
        {kids.length > 0
          ? <button className="expander" onClick={() => toggle(person.id)} aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Show' : 'Hide'} ${kids.length} direct reports of ${name}`}><Icon name={isCollapsed ? 'right' : 'down'} size={16} /></button>
          : <span className="expander-gap" />}
        <Avatar name={name} size={38} />
        <div className="node-text">
          <Link to={`/employees/${person.id}`}>{name}</Link>
          <small>{person.jobTitle}{person.departmentName ? `, ${person.departmentName}` : ''}</small>
        </div>
        {kids.length > 0 && <span className="count">{kids.length} {kids.length === 1 ? 'report' : 'reports'}</span>}
      </div>
      {kids.length > 0 && !isCollapsed && (
        <ul>{kids.map((k) => <Node key={k.id} person={k} children={children} collapsed={collapsed} toggle={toggle} />)}</ul>
      )}
    </li>
  );
}

export default function OrgChart() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());

  useEffect(() => { api('/employees/org-chart').then(setPeople).catch((e) => setError(e.message)); }, []);

  const { roots, children } = useMemo(() => {
    const byId = new Map((people || []).map((p) => [p.id, p]));
    const kids = new Map();
    const top = [];
    (people || []).forEach((p) => {
      if (p.managerId && byId.has(p.managerId)) kids.set(p.managerId, [...(kids.get(p.managerId) || []), p]);
      else top.push(p);
    });
    return { roots: top, children: kids };
  }, [people]);

  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="page-head">
        <div><h1>Org chart</h1><p className="muted">Who reports to whom. Select a name to open their profile.</p></div>
        <div className="head-actions">
          <button onClick={() => setCollapsed(new Set())}>Expand all</button>
          <button onClick={() => setCollapsed(new Set([...children.keys()]))}>Collapse all</button>
        </div>
      </div>
      <ErrorNote error={error} />
      {!people ? <p className="muted">Loading…</p> : roots.length === 0 ? <div className="panel"><Empty>No people to show yet.</Empty></div> : (
        <section className="panel"><ul className="tree">
          {roots.map((r) => <Node key={r.id} person={r} children={children} collapsed={collapsed} toggle={toggle} />)}
        </ul></section>
      )}
    </>
  );
}
