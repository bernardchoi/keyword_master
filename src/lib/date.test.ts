import { describe, expect, it } from 'vitest';
import { formatYmd, isPartialMonth, kstToday, monthKey, monthRange, monthsAgoStart } from './date';

describe('kstToday', () => {
  it('UTC 09:00 이전에는 KST 로 다음 날짜가 된다', () => {
    // 2026-08-23 23:30 UTC == 2026-08-24 08:30 KST (아직 24일)
    const before = Date.UTC(2026, 7, 23, 23, 30);
    expect(kstToday(before)).toEqual({ year: 2026, month: 8, day: 24 });
  });

  it('UTC 15:00 == KST 00:00, 날짜가 하루 넘어간다', () => {
    // 2026-08-23 15:00 UTC == 2026-08-24 00:00 KST
    const at = Date.UTC(2026, 7, 23, 15, 0);
    expect(kstToday(at)).toEqual({ year: 2026, month: 8, day: 24 });
  });

  it('UTC 14:59 은 아직 KST 로 전날이다', () => {
    const at = Date.UTC(2026, 7, 23, 14, 59);
    expect(kstToday(at)).toEqual({ year: 2026, month: 8, day: 23 });
  });
});

describe('monthsAgoStart', () => {
  it('setMonth 와 달리 31일 기준으로도 날짜가 밀리지 않는다', () => {
    // 5월 31일 - 3개월 == 2월 1일 (setMonth(-3) 이면 3월 3일로 밀리는 버그가 있었음)
    const from = { year: 2026, month: 5, day: 31 };
    expect(monthsAgoStart(3, from)).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it('연도 경계를 넘어간다', () => {
    const from = { year: 2026, month: 2, day: 15 };
    expect(monthsAgoStart(3, from)).toEqual({ year: 2025, month: 11, day: 1 });
  });

  it('0개월 전은 이번 달 1일', () => {
    const from = { year: 2026, month: 8, day: 24 };
    expect(monthsAgoStart(0, from)).toEqual({ year: 2026, month: 8, day: 1 });
  });
});

describe('monthRange', () => {
  it('startDate 는 n개월 전 1일, endDate 는 오늘', () => {
    const range = monthRange(12);
    const today = kstToday();
    expect(range.endDate).toBe(formatYmd(today));
    expect(range.timeUnit).toBe('month');
    expect(range.startDate.endsWith('-01')).toBe(true);
  });
});

describe('monthKey / formatYmd', () => {
  it('한 자리 월·일에 0을 채운다', () => {
    expect(formatYmd({ year: 2026, month: 3, day: 5 })).toBe('2026-03-05');
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
  });
});

describe('isPartialMonth', () => {
  it('period 가 오늘(KST)이 속한 달과 같으면 true — YYYY-MM, YYYY-MM-DD 형식 모두', () => {
    const at = Date.UTC(2026, 7, 7, 3, 0); // 2026-08-07 12:00 KST
    expect(isPartialMonth('2026-08', at)).toBe(true);
    expect(isPartialMonth('2026-08-15', at)).toBe(true);
  });

  it('지난달은 false', () => {
    const at = Date.UTC(2026, 7, 7, 3, 0);
    expect(isPartialMonth('2026-07', at)).toBe(false);
  });
});
