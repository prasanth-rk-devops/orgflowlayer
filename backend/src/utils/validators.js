const { z } = require('zod');

/** YYYY-MM-DD that is also a real calendar date (rejects 2030-02-31). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Not a real calendar date');

module.exports = { isoDate };
