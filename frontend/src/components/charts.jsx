const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Working days of approved leave per month. The current month is drawn in gold. */
export function MonthBars({ values, currentMonth }) {
  const max = Math.max(4, ...values);
  const W = 372; const H = 150; const base = 118; const top = 18; const bw = 20; const gap = (W - 12 * bw) / 11;
  const total = values.reduce((a, b) => a + b, 0);
  const summary = `Approved leave days by month. Total ${total}. ` + values.map((v, i) => `${MONTH_NAMES[i]} ${v}`).join(', ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={summary}>
      <line x1="0" x2={W} y1={base} y2={base} className="chart-axis" />
      {values.map((v, i) => {
        const h = v === 0 ? 0 : Math.max(3, (v / max) * (base - top));
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={bw} height={h} rx="3" className={i === currentMonth ? 'chart-bar now' : 'chart-bar'} />
            {v > 0 && <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" className="chart-val">{v}</text>}
            <text x={x + bw / 2} y={base + 18} textAnchor="middle" className={i === currentMonth ? 'chart-lbl now' : 'chart-lbl'}>{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Headcount by department as a ring with a legend. */
export function Donut({ data }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  const r = 40; const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut" role="img"
        aria-label={`Headcount by department. ${data.map((d) => `${d.name} ${d.count}`).join(', ')}`}>
        <circle cx="50" cy="50" r={r} className="donut-track" />
        {data.map((d, i) => {
          const len = total ? (d.count / total) * C : 0;
          const seg = (
            <circle key={d.name} cx="50" cy="50" r={r} className={`donut-seg s${i % 6}`}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
          );
          offset += len;
          return seg;
        })}
        <text x="50" y="49" textAnchor="middle" className="donut-num">{total}</text>
        <text x="50" y="62" textAnchor="middle" className="donut-cap">people</text>
      </svg>
      <ul className="legend">
        {data.map((d, i) => <li key={d.name}><i className={`sw s${i % 6}`} />{d.name}<b>{d.count}</b></li>)}
      </ul>
    </div>
  );
}

/** Labelled horizontal bars. rows: [{ label, value, note? }] */
export function HBars({ rows, unit = '' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hb-label">{r.label}</span>
          <span className="hb-track"><i style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <b className="hb-val">{r.value}{unit}</b>
          {r.note && <small className="hb-note">{r.note}</small>}
        </li>
      ))}
    </ul>
  );
}
