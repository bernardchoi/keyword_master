import { describe, expect, it } from 'vitest';
import { computeCompetition, mapLimit } from './metrics';
import type { KeywordMetric } from './types';

function metric(totalSearches: number, masked = false): KeywordMetric {
  return {
    keyword: 'k',
    pcSearches: 0,
    mobileSearches: 0,
    totalSearches,
    mobileShare: 0,
    pcClicks: 0,
    mobileClicks: 0,
    pcCtr: 0,
    mobileCtr: 0,
    adDepth: 0,
    compIdx: '중간',
    masked,
  };
}

describe('computeCompetition', () => {
  it.each([
    [0.1, '최고'],
    [0.5, '좋음'],
    [1, '보통'],
    [5, '나쁨'],
    [5.01, '최악'],
  ] as const)('ratio %d → 등급 %s', (ratio, expectedGrade) => {
    const searches = 1000;
    const blog = Math.round(searches * ratio);
    const result = computeCompetition(metric(searches), { blog });
    expect(result.grade).toBe(expectedGrade);
  });

  it('경계값 바로 위(0.5초과·1이하 등)에서 등급이 한 단계 나빠진다', () => {
    const searches = 1000;
    const result = computeCompetition(metric(searches), { blog: 501 }); // ratio 0.501
    expect(result.grade).toBe('보통');
  });

  it('검색수 0이어도 0으로 나누지 않고 최소 1로 취급한다', () => {
    const result = computeCompetition(metric(0), { blog: 5 });
    expect(result.ratio).toBe(5); // 5 / max(0,1)
    expect(result.grade).toBe('나쁨');
  });

  it('lowerBound 는 검색수 마스킹 여부를 그대로 옮긴다', () => {
    expect(computeCompetition(metric(9, true), { blog: 1 }).lowerBound).toBe(true);
    expect(computeCompetition(metric(1000, false), { blog: 1 }).lowerBound).toBe(false);
  });
});

describe('mapLimit', () => {
  it('입력 순서대로 결과를 돌려준다 (완료 순서와 무관하게)', async () => {
    const items = [30, 10, 20, 5];
    const result = await mapLimit(items, 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(result).toEqual(items);
  });

  it('동시 실행 개수가 limit 을 넘지 않는다', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapLimit(items, 3, async (i) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return i;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('limit 이 배열 길이보다 크면 전부 동시에 실행된다', async () => {
    const items = [1, 2, 3];
    const result = await mapLimit(items, 100, async (i) => i * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('빈 배열은 빈 배열을 반환한다', async () => {
    const result = await mapLimit<number, number>([], 5, async (i) => i);
    expect(result).toEqual([]);
  });
});
