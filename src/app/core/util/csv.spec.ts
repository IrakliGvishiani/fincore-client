import { escapeCsvField, toCsv } from './csv';

describe('csv', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('plain')).toBe('plain');
  });

  it('neutralises formula-like text but keeps plain numbers', () => {
    expect(escapeCsvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
    expect(escapeCsvField('-12.50')).toBe('-12.50');
    expect(escapeCsvField(-3)).toBe('-3');
  });

  it('renders empty values and CRLF rows', () => {
    const csv = toCsv([{ a: 'x', b: null }], [
      { header: 'A', value: (r: { a: string; b: null }) => r.a },
      { header: 'B', value: (r: { a: string; b: null }) => r.b },
    ]);
    expect(csv).toBe('A,B\r\nx,\r\n');
  });
});
