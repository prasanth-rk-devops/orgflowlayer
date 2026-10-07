const { toCsv, cell } = require('../src/utils/csv');

describe('csv', () => {
  test('escapes commas, quotes and newlines', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell('line1\nline2')).toBe('"line1\nline2"');
  });
  test('neutralises spreadsheet formulas', () => {
    expect(cell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(cell('+cmd')).toBe("'+cmd");
    expect(cell('@x')).toBe("'@x");
  });
  test('keeps negative numbers and nulls intact', () => {
    expect(cell(-5)).toBe('-5');
    expect(cell(null)).toBe('');
    expect(cell(undefined)).toBe('');
  });
  test('builds header + rows with BOM and CRLF', () => {
    const out = toCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: 1, b: 'x,y' }]);
    expect(out).toBe('\uFEFFA,B\r\n1,"x,y"\r\n');
  });
});
