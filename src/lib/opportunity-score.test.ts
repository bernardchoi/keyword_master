import { describe, expect, it } from 'vitest';
import { computeOpportunityScores } from './opportunity-score';
import type { KeywordRow } from './types';

function row(keyword: string, searches: number, ratio: number | null, masked = false): KeywordRow {
  return {
    keyword, pcSearches: searches / 2, mobileSearches: searches / 2, totalSearches: searches,
    mobileShare: 0.5, pcClicks: 0, mobileClicks: 0, pcCtr: 0, mobileCtr: 0,
    adDepth: 0, compIdx: '중간', masked, docs: ratio === null ? null : { blog: searches * ratio },
    competition: ratio === null ? null : { ratio, grade: '보통', lowerBound: masked },
    rank: 1, isSeed: false,
  };
}

describe('computeOpportunityScores', () => {
  it('수요가 높고 경쟁이 낮은 키워드에 더 높은 점수를 준다', () => {
    const scores = computeOpportunityScores([row('좋음', 10000, 0.1), row('나쁨', 100, 10)]);
    expect(scores.get('좋음')!.score).toBeGreaterThan(scores.get('나쁨')!.score);
  });

  it('경쟁 자료가 없으면 0점 대신 남은 항목을 재정규화하고 신뢰도를 낮춘다', () => {
    const score = computeOpportunityScores([row('자료없음', 1000, null)]).get('자료없음')!;
    expect(score.score).toBeGreaterThan(0);
    expect(score.competition).toBeNull();
    expect(score.confidence).toBe('낮음');
  });

  it('마스킹된 검색량은 신뢰도를 높음으로 표시하지 않는다', () => {
    expect(computeOpportunityScores([row('마스킹', 9, 1, true)]).get('마스킹')!.confidence).toBe('보통');
  });

  it('같은 키워드는 함께 계산한 다른 행과 무관하게 같은 점수를 받는다', () => {
    const target = row('고정', 1000, 0.5);
    const alone = computeOpportunityScores([target]).get('고정')!.score;
    const together = computeOpportunityScores([target, row('대형', 1_000_000, 0.01)]).get('고정')!.score;
    expect(together).toBe(alone);
  });
});
