import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorNote } from '../components/ui';

const shift = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

export default function Calendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState({ leave: [], holidays: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/leave/calendar?month=${month}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [month]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const today = new Date().toISOString().slice(0, 10);
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <>
      <div className="page-head"><h1>Team calendar</h1>
        <div className="year-nav"><button onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">‹</button>
          <b>{title}</b><button onClick={() => setMonth(shift(month, 1))} aria-label="Next month">›</button></div>
      </div>
      <ErrorNote error={error} />
      <div className="cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="cal-head" key={d}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div className="cal-cell blank" key={`b${i}`} />;
          const iso = `${month}-${String(d).padStart(2, '0')}`;
          const out = data.leave.filter((l) => l.startDate <= iso && l.endDate >= iso);
          const holiday = data.holidays.find((h) => h.date === iso);
          const weekend = i % 7 >= 5;
          return (
            <div key={iso} className={`cal-cell${weekend ? ' weekend' : ''}${iso === today ? ' today' : ''}`}>
              <span className="cal-day">{d}</span>
              {holiday && <div className="cal-holiday">{holiday.name}</div>}
              {!weekend && out.slice(0, 3).map((l, k) => <div className="cal-out" key={k} title={`${l.name} · ${l.leaveType}`}>{l.name}</div>)}
              {!weekend && out.length > 3 && <div className="muted small">+{out.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
