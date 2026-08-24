import { describe, expect, it } from 'vitest';
import { compact, n, pct, ratio, won } from './format';

describe('n', () => {
  it('천 단위 콤마를 찍는다', () => {
    expect(n(1234567)).toBe('1,234,567');
  });
  it('null/undefined/NaN/Infinity 는 -', () => {
    expect(n(null)).toBe('-');
    expect(n(undefined)).toBe('-');
    expect(n(NaN)).toBe('-');
    expect(n(Infinity)).toBe('-');
  });
  it('소수는 반올림한다', () => {
    expect(n(1.6)).toBe('2');
  });
});

describe('compact', () => {
  it('만 미만은 그대로 콤마 표기', () => {
    expect(compact(9999)).toBe('9,999');
  });
  it('만 단위는 소수 1자리 (10만 미만)', () => {
    expect(compact(12_345)).toBe('1.2만');
  });
  it('10만 이상은 만 단위 정수로', () => {
    expect(compact(120_000)).toBe('12만');
  });
  it('억 단위는 소수 1자리', () => {
    expect(compact(150_000_000)).toBe('1.5억');
  });
  it('null 은 -', () => {
    expect(compact(null)).toBe('-');
  });
});

describe('pct', () => {
  it('0~1 비율을 퍼센트 문자열로', () => {
    expect(pct(0.4567)).toBe('45.7%');
  });
  it('소수 자릿수를 지정할 수 있다', () => {
    expect(pct(0.4567, 0)).toBe('46%');
  });
  it('null 은 -', () => {
    expect(pct(undefined)).toBe('-');
  });
});

describe('ratio', () => {
  it('100 이상은 정수', () => {
    expect(ratio(123.456)).toBe('123');
  });
  it('10~100 은 소수 1자리', () => {
    expect(ratio(12.345)).toBe('12.3');
  });
  it('10 미만은 소수 2자리', () => {
    expect(ratio(1.2345)).toBe('1.23');
  });
  it('null 은 -', () => {
    expect(ratio(null)).toBe('-');
  });
});

describe('won', () => {
  it('원 단위를 붙인다', () => {
    expect(won(12345)).toBe('12,345원');
  });
  it('0 은 falsy 라서 - 로 표시된다', () => {
    expect(won(0)).toBe('-');
  });
  it('null 은 -', () => {
    expect(won(null)).toBe('-');
  });
});
