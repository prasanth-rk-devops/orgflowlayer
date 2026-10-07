/**
 * Count working days between two ISO dates (YYYY-MM-DD), inclusive.
 * Skips Saturdays, Sundays and any date in `holidays` (array or Set of YYYY-MM-DD strings).
 */
function businessDays(start, end, holidays = []) {
  const skip = holidays instanceof Set ? holidays : new Set(holidays);
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let count = 0;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !skip.has(d.toISOString().slice(0, 10))) count += 1;
  }
  return count;
}

module.exports = { businessDays };
