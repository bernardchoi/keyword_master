import type { KeywordRow } from './types';

export interface OpportunityScore {
  score: number;
  confidence: '높음' | '보통' | '낮음';
  demand: number;
  competition: number | null;
  mobile: number;
  reasons: string[];
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * 모든 조회에서 같은 고정 구간으로 계산하는 콘텐츠·수요 기회점수.
 * 검색량 40%, 블로그 경쟁 45%, 모바일 비중 15%를 사용한다.
 * 경쟁 데이터가 없으면 그 항목을 0점으로 만들지 않고 남은 가중치만 재정규화한다.
 */
export function computeOpportunityScores(rows: KeywordRow[]): Map<string, OpportunityScore> {
  return new Map(rows.map((row) => {
    const demand = row.masked
      ? 0
      : Math.round(clamp((Math.log10(Math.max(row.totalSearches, 10)) - 1) / 5) * 100);
    const competition = row.competition
      ? Math.round(clamp(1 - (Math.log10(Math.max(row.competition.ratio, 0.01)) + 2) / 4) * 100)
      : null;
    const mobile = Math.round(clamp(row.mobileShare) * 100);
    const weighted = demand * 0.4 + mobile * 0.15 + (competition ?? 0) * 0.45;
    const availableWeight = 0.55 + (competition === null ? 0 : 0.45);
    const score = Math.round(weighted / availableWeight);
    const confidence: OpportunityScore['confidence'] = !row.competition
      ? '낮음'
      : row.masked || row.competition.lowerBound
        ? '보통'
        : '높음';
    const reasons = [
      `검색 수요 ${demand}점`,
      competition === null ? '블로그 경쟁 자료 없음' : `콘텐츠 경쟁 ${competition}점`,
      `모바일 비중 ${mobile}점`,
    ];

    return [row.keyword, { score, confidence, demand, competition, mobile, reasons }];
  }));
}
