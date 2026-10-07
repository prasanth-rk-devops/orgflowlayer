import { useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { MonthBars, HBars } from '../components/charts';
import { Empty, ErrorNote } from '../components/ui';

export default function Reports() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setD(null); api(`/reports/summary?year=${year}`).then(setD).catch((e) => setError(e.message)); }, [year]);

  const t = d?.totals;
  return (
    <>
      <div className="page-head">
        <div><h1>Reports</h1><p className="muted">How time off is used across the company.</p></div>
        <div className="head-actions">
          <div className="year-nav">
            <button onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button><b>{year}</b>
            <button onClick={() => setYear(year + 1)} disabled={year >= thisYear + 1} aria-label="Next year">›</button>
          </div>
          <button onClick={() => downloadFile(`/leave/export.csv?year=${year}`, `leave-${year}.csv`).catch((e) => setError(e.message))}>Download leave CSV</button>
        </div>
      </div>
      <ErrorNote error={error} />
      {!d ? <p className="muted">Loading…</p> : (
        <>
          <div className="figures four">
            <div className="figure"><b>{t.approvedDays}</b><span>working days taken</span></div>
            <div className="figure"><b>{t.approvedRequests}</b><span>approved requests</span></div>
            <div className="figure"><b>{t.approvalRate === null ? '–' : `${t.approvalRate}%`}</b><span>of decisions approved</span></div>
            <div className="figure"><b>{t.avgHoursToDecision === null ? '–' : t.avgHoursToDecision < 48 ? `${t.avgHoursToDecision} h` : `${Math.round(t.avgHoursToDecision / 24)} d`}</b><span>average time to decide</span></div>
          </div>

          <div className="grid2">
            <section className="panel">
              <div className="panel-head"><h2>Leave by month</h2></div>
              <MonthBars values={d.byMonth} currentMonth={year === thisYear ? new Date().getMonth() : -1} />
              <p className="muted small">Approved working days, by the month each absence starts.</p>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Leave by type</h2></div>
              {t.approvedDays === 0 ? <Empty>No approved leave in {year}.</Empty>
                : <HBars rows={d.byType.map((x) => ({ label: x.type, value: x.days, note: `${x.requests} ${x.requests === 1 ? 'request' : 'requests'}` }))} unit=" d" />}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Leave by department</h2></div>
              <HBars rows={d.byDepartment.map((x) => ({ label: x.department, value: x.days, note: `${x.daysPerPerson} days per person, ${x.people} ${x.people === 1 ? 'person' : 'people'}` }))} unit=" d" />
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Most days away</h2></div>
              {d.mostAbsent.length === 0 ? <Empty>No approved leave in {year}.</Empty>
                : <HBars rows={d.mostAbsent.map((x) => ({ label: x.name, value: x.days }))} unit=" d" />}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>How long people have been here</h2></div>
              <HBars rows={d.tenureBands.map((x) => ({ label: x.band, value: x.count }))} />
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Hires by year</h2></div>
              {d.hiresByYear.length === 0 ? <Empty>No hires recorded.</Empty> : <HBars rows={d.hiresByYear.map((x) => ({ label: String(x.year), value: x.hires }))} />}
            </section>
          </div>
        </>
      )}
    </>
  );
}
