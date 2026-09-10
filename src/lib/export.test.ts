import { describe, expect, it } from 'vitest';
import { toCsv } from './export';
describe('CSV cell safety', () => {
  it.each(['=1+1', '+cmd', '-cmd', '@SUM(A1)', '  =1', '\tvalue'])('neutralizes string cell %j', (value) => {
    expect(toCsv(['header'], [[value]])).toContain(`\r\n'${value}`);
  });
  it('preserves numeric negatives and escapes CR and quotes', () => {
    expect(toCsv(['header'], [[-10], ['a\rb'], ['a"b']])).toBe('\ufeffheader\r\n-10\r\n"a\rb"\r\n"a""b"');
  });
});
