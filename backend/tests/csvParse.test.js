const { parseCsv } = require('../src/utils/csvParse');

describe('parseCsv', () => {
  test('simple rows', () => expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]));
  test('CRLF line endings', () => expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]));
  test('quoted comma and newline', () => expect(parseCsv('a,b\n"x, y","l1\nl2"')).toEqual([['a', 'b'], ['x, y', 'l1\nl2']]));
  test('escaped quotes', () => expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]));
  test('strips the BOM Excel adds', () => expect(parseCsv('\uFEFFa,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]));
  test('skips blank lines', () => expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]));
  test('keeps empty fields', () => expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]));
  test('semicolon files (Excel in many locales)', () => expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]));
  test('last row without trailing newline', () => expect(parseCsv('a\n1')).toEqual([['a'], ['1']]));
  test('unterminated quote is an error', () => {
    let msg = '';
    try { parseCsv('a\n"oops'); } catch (e) { msg = e.message; }
    expect(msg.includes('never closes')).toBe(true);
  });
});
