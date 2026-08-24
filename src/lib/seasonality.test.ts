import { describe, expect, it } from 'vitest';
import { kstToday } from './date';
import { computeNewsPulse, computeSeasonality } from './seasonality';
import type { TrendPoint } from './types';

/** 3개년치 월별 포인트를 만든다. ratioOf(month) 로 달마다 값을 지정한다. */
function points(ratioOf: (month: number) => number, years = [2023, 2024, 2025]): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      out.push({
        period: `${year}-${String(month).padStart(2, '0')}`,
        ratio: ratioOf(month),
      });
    }
  }
  return out;
}

describe('computeSeasonality', () => {
  it('완결된 달이 12개 미만이면 null', () => {
    const short = points(() => 50, [2025]).slice(0, 11);
    expect(computeSeasonality(short)).toBeNull();
  });

  it('12개 이상이어도 서로 다른 달이 12개를 못 채우면(한 달이 통째로 빔) null', () => {
    const missingMonth = points(() => 50).filter((p) => !p.period.endsWith('-12'));
    expect(computeSeasonality(missingMonth)).toBeNull();
  });

  it('진행 중인 달(partial)은 계산에서 제외된다', () => {
    const base = points((m) => (m === 7 ? 100 : 40));
    const withoutPartial = computeSeasonality(base);

    // 극단적으로 다른 값을 가진 partial 포인트를 하나 끼워 넣어도 결과가 같아야 한다
    const withPartial = computeSeasonality([
      ...base,
      { period: '2026-07', ratio: 1, partial: true },
    ]);

    expect(withPartial).toEqual(withoutPartial);
  });

  it('변동이 없으면(평탄) 시즌성 없음 판정', () => {
    const flat = computeSeasonality(points(() => 50));
    expect(flat).not.toBeNull();
    expect(flat!.amplitude).toBe(0);
    expect(flat!.level).toBe('없음');
    expect(flat!.currentPhase).toBe('보통');
  });

  it('이번 달이 유독 높으면 성수기로, 유독 낮으면 비수기로 판정한다', () => {
    const thisMonth = kstToday().month;

    const high = computeSeasonality(points((m) => (m === thisMonth ? 100 : 40)));
    expect(high!.level).toBe('뚜렷');
    expect(high!.peakMonths).toContain(thisMonth);
    expect(high!.currentPhase).toBe('성수기');

    const low = computeSeasonality(points((m) => (m === thisMonth ? 10 : 50)));
    expect(low!.lowMonths).toContain(thisMonth);
    expect(low!.currentPhase).toBe('비수기');
  });

  it('monthly 지수는 최댓값을 100으로 한 상댓값이다', () => {
    const thisMonth = kstToday().month;
    const result = computeSeasonality(points((m) => (m === thisMonth ? 100 : 50)))!;
    const peak = result.monthly.find((m) => m.month === thisMonth)!;
    expect(peak.index).toBe(100);
    expect(Math.max(...result.monthly.map((m) => m.index))).toBe(100);
  });
});

describe('computeNewsPulse', () => {
  it('기사가 하나도 없으면 조용함 · null 값들', () => {
    const result = computeNewsPulse(0, []);
    expect(result).toEqual({
      total: 0,
      sampled: 0,
      spanDays: null,
      perDay: null,
      level: '조용함',
      latest: null,
    });
  });

  it('짧은 기간에 몰려 있을수록(발행 밀도가 높을수록) 등급이 올라간다', () => {
    // Date.UTC 의 day 인자는 소수점을 버리므로, 정확한 간격을 위해 ms 단위로 뺀다.
    const baseMs = Date.UTC(2026, 7, 20);
    const day = (offsetDays: number) => new Date(baseMs - offsetDays * 86_400_000).toISOString();

    const hot = computeNewsPulse(
      1000,
      Array.from({ length: 60 }, (_, i) => ({ title: 't', link: 'l', pubDate: day(i / 60) })),
    );
    expect(hot!.level).toBe('매우 뜨거움'); // perDay >= 50

    const quiet = computeNewsPulse(
      1000,
      Array.from({ length: 3 }, (_, i) => ({ title: 't', link: 'l', pubDate: day(i * 10) })),
    );
    expect(quiet!.perDay).toBeLessThan(1);
    expect(quiet!.level).toBe('조용함');
  });

  it('latest 는 가장 최신 기사의 날짜(YYYY-MM-DD)다', () => {
    const result = computeNewsPulse(2, [
      { title: 'a', link: 'l', pubDate: new Date(Date.UTC(2026, 7, 10)).toISOString() },
      { title: 'b', link: 'l', pubDate: new Date(Date.UTC(2026, 7, 20)).toISOString() },
    ]);
    expect(result!.latest).toBe('2026-08-20');
  });
});
