import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Donut, MonthBars } from '../components/charts';
import { ErrorNote, Empty } from '../components/ui';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [news, setNews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard').then(setD).catch((e) => setError(e.message));
    api('/announcements?limit=3').then(setNews).catch(() => {});
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!d) return <p className="muted">Loading…</p>;

  const isEmployee = user.role === 'employee';
  const out = d.onLeaveToday.length;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const summary = [
    `${out === 0 ? 'Everyone is in today' : `${out} ${out === 1 ? 'person is' : 'people are'} out today`}.`,
    d.pendingCount > 0
      ? (isEmployee
        ? `${d.pendingCount} of your requests ${d.pendingCount === 1 ? 'is' : 'are'} waiting for a decision.`
        : `${d.pendingCount} ${d.pendingCount === 1 ? 'request needs' : 'requests need'} your decision.`)
      : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <header className="hero">
        <p className="hero-date">{today}</p>
        <h1>{greeting()}, {user.firstName || user.email}.</h1>
        <p className="hero-sub">{summary}</p>
      </header>

      <div className="figures">
        <div className="figure"><b>{d.headcount}</b><span>people at the company</span></div>
        <div className="figure"><b>{out}</b><span>out today</span></div>
        <Link className="figure link-figure" to={isEmployee ? '/leave' : '/approvals'}>
          <b>{d.pendingCount}</b><span>{isEmployee ? 'your pending requests' : 'awaiting decision'}</span>
        </Link>
      </div>

      <div className="grid-main">
        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>Announcements</h2><Link to="/announcements" className="more">See all</Link></div>
            {news.length === 0 ? <Empty>No announcements yet.</Empty> : (
              <ul className="news">{news.map((n) => (
                <li key={n.id}>
                  <h3>{n.pinned && <span className="pin" title="Pinned"><Icon name="pin" size={14} /></span>}{n.title}</h3>
                  <p>{n.body}</p>
                  <small className="muted">{n.authorName}, {when(n.createdAt)}</small>
                </li>))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Leave taken this year</h2></div>
            <MonthBars values={d.leaveByMonth} currentMonth={new Date().getMonth()} />
            <p className="muted small">Approved working days, by the month each absence starts.</p>
          </section>
        </div>

        <div className="col">
          <section className="panel">
            <div className="panel-head"><h2>Who is out</h2><Link to="/calendar" className="more">Calendar</Link></div>
            {out === 0 ? <Empty>Everyone is in today.</Empty> : (
              <ul className="people-list">{d.onLeaveToday.map((x, i) => (
                <li key={i}><Avatar name={x.name} /><div><b>{x.name}</b><small>{x.leaveType}, back after {shortDate(x.endDate)}</small></div></li>))}
              </ul>
            )}
            {d.upcomingLeave.length > 0 && (<>
              <h3 className="sub">Coming up in the next 30 days</h3>
              <ul className="people-list">{d.upcomingLeave.slice(0, 5).map((x, i) => (
                <li key={i}><Avatar name={x.name} size={30} /><div><b>{x.name}</b><small>{shortDate(x.startDate)} to {shortDate(x.endDate)}</small></div></li>))}
              </ul>
            </>)}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Headcount by department</h2></div>
            {d.byDepartment.length === 0 ? <Empty>No employees yet.</Empty> : <Donut data={d.byDepartment} />}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>This month</h2></div>
            {d.celebrations.length === 0 ? <Empty>No work anniversaries or new joiners this month.</Empty> : (
              <ul className="people-list">{d.celebrations.map((c) => (
                <li key={c.id}><Avatar name={c.name} size={32} />
                  <div><b>{c.name}</b>
                    <small>{c.years === 0 ? `Joined this month, ${c.jobTitle}` : `${c.years} ${c.years === 1 ? 'year' : 'years'} at the company on the ${c.day}${['th', 'st', 'nd', 'rd'][(c.day % 100 > 10 && c.day % 100 < 14) ? 0 : Math.min(c.day % 10, 4) % 4] || 'th'}`}</small></div></li>))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
