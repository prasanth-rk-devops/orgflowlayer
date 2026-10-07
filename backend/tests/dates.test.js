const { businessDays } = require('../src/utils/dates');

describe('businessDays', () => {
  test('single weekday = 1', () => expect(businessDays('2026-10-06', '2026-10-06')).toBe(1));
  test('Mon-Fri week = 5', () => expect(businessDays('2026-10-05', '2026-10-09')).toBe(5));
  test('skips weekends', () => expect(businessDays('2026-10-02', '2026-10-05')).toBe(2)); // Fri..Mon
  test('weekend only = 0', () => expect(businessDays('2026-10-03', '2026-10-04')).toBe(0));
  test('end before start = 0', () => expect(businessDays('2026-10-09', '2026-10-05')).toBe(0));
  test('invalid input = 0', () => expect(businessDays('nope', '2026-10-05')).toBe(0));
});

describe('businessDays with holidays', () => {
  test('a weekday holiday is not counted', () => expect(businessDays('2026-10-05', '2026-10-09', ['2026-10-07'])).toBe(4));
  test('a holiday on a weekend changes nothing', () => expect(businessDays('2026-10-05', '2026-10-09', ['2026-10-10'])).toBe(5));
  test('range that is all holidays = 0', () => expect(businessDays('2026-10-07', '2026-10-07', ['2026-10-07'])).toBe(0));
  test('accepts a Set', () => expect(businessDays('2026-10-05', '2026-10-06', new Set(['2026-10-05']))).toBe(1));
});
