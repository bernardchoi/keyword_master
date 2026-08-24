import { describe, expect, it } from 'vitest';
import {
  computeHistoryDiff,
  relativeTimeLabel,
  sameSnapshot,
  snapshotFromAnalysis,
  type HistorySnapshot,
} from './history';
import type { AnalyzeResponse } from './types';

function snap(overrides: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    at: 0,
    totalSearches: 1000,
    pcSearches: 400,
    mobileSearches: 600,
    masked: false,
    grade: '보통',
    ratio: 0.7,
    lowerBound: false,
    rowCount: 100,
    totalRelated: 592,
    ...overrides,
  };
}

describe('snapshotFromAnalysis', () => {
  it('seed 가 없으면 null', () => {
    expect(snapshotFromAnalysis({ seed: null, rows: [], totalRelated: 0 })).toBeNull();
  });

  it('seed 의 핵심 지표를 뽑는다', () => {
    const res: Pick<AnalyzeResponse, 'seed' | 'rows' | 'totalRelated'> = {
      seed: {
        keyword: '여름원피스',
        pcSearches: 400,
        mobileSearches: 600,
        totalSearches: 1000,
        mobileShare: 0.6,
        pcClicks: 0,
        mobileClicks: 0,
        pcCtr: 0,
        mobileCtr: 0,
        adDepth: 0,
        compIdx: '중간',
        masked: false,
        docs: { blog: 700 },
        competition: { ratio: 0.7, grade: '보통', lowerBound: false },
        rank: 1,
        isSeed: true,
      },
      rows: new Array(50).fill(null),
      totalRelated: 592,
    };
    const s = snapshotFromAnalysis(res, 12345);
    expect(s).toEqual({
      at: 12345,
      totalSearches: 1000,
      pcSearches: 400,
      mobileSearches: 600,
      masked: false,
      grade: '보통',
      ratio: 0.7,
      lowerBound: false,
      rowCount: 50,
      totalRelated: 592,
    });
  });
});

describe('sameSnapshot', () => {
  it('at 을 빼고 나머지 필드가 같으면 true', () => {
    expect(sameSnapshot(snap({ at: 1 }), snap({ at: 2 }))).toBe(true);
  });

  it('검색수가 다르면 false', () => {
    expect(sameSnapshot(snap(), snap({ totalSearches: 1001 }))).toBe(false);
  });
});

describe('computeHistoryDiff', () => {
  it('검색량 증가율을 계산한다', () => {
    const diff = computeHistoryDiff(snap({ totalSearches: 1000 }), snap({ totalSearches: 1200 }));
    expect(diff.searchChangePct).toBeCloseTo(0.2);
  });

  it('마스킹된 조회가 섞이면 변화율을 계산하지 않는다', () => {
    const withMaskedPrev = computeHistoryDiff(
      snap({ masked: true, totalSearches: 5 }),
      snap({ totalSearches: 1200 }),
    );
    expect(withMaskedPrev.searchChangePct).toBeNull();

    const withMaskedCurrent = computeHistoryDiff(
      snap({ totalSearches: 1000 }),
      snap({ masked: true, totalSearches: 5 }),
    );
    expect(withMaskedCurrent.searchChangePct).toBeNull();
  });

  it('이전 검색수가 0이면 변화율을 계산하지 않는다 (0으로 나누기 방지)', () => {
    const diff = computeHistoryDiff(snap({ totalSearches: 0 }), snap({ totalSearches: 500 }));
    expect(diff.searchChangePct).toBeNull();
  });

  it('등급이 바뀌면 gradeChanged=true', () => {
    const diff = computeHistoryDiff(snap({ grade: '보통' }), snap({ grade: '좋음' }));
    expect(diff.gradeChanged).toBe(true);
  });

  it('등급이 같거나 둘 중 하나라도 null 이면 gradeChanged=false', () => {
    expect(computeHistoryDiff(snap({ grade: '보통' }), snap({ grade: '보통' })).gradeChanged).toBe(
      false,
    );
    expect(computeHistoryDiff(snap({ grade: null }), snap({ grade: '보통' })).gradeChanged).toBe(
      false,
    );
  });
});

describe('relativeTimeLabel', () => {
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);

  it('1분 미만은 방금', () => {
    expect(relativeTimeLabel(now - 30_000, now)).toBe('방금');
  });

  it('분·시간·일 단위로 반올림 없이 내림한다', () => {
    expect(relativeTimeLabel(now - 5 * 60_000, now)).toBe('5분 전');
    expect(relativeTimeLabel(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(relativeTimeLabel(now - 2 * 86_400_000, now)).toBe('2일 전');
  });

  it('미래 시각이 들어와도 음수가 되지 않는다', () => {
    expect(relativeTimeLabel(now + 10_000, now)).toBe('방금');
  });
});
