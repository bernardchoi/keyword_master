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
 * 누락된 경쟁 항목은 가산하지 않아 조회 실패가 점수 상승으로 이어지지 않는다.
 */
export function computeOpportunityScores(rows: KeywordRow[]): Map<string, OpportunityScore> {
  return new Map(rows.map((row) => {
    // 이전 저장 데이터에는 기기별 마스킹 정보가 없어 양쪽 모두 보수적으로 계산한다.
    const pc = (row.pcMasked ?? row.masked) ? Math.max(0, row.pcSearches - 10) : row.pcSearches;
    const mo = (row.mobileMasked ?? row.masked) ? Math.max(0, row.mobileSearches - 10) : row.mobileSearches;
    const searches = pc + mo;
    const demand = Math.round(clamp((Math.log10(Math.max(searches, 10)) - 1) / 5) * 100);
    const competitionRatio = row.masked && row.docs
      ? row.docs.blog / Math.max(searches, 1)
      : row.competition?.ratio ?? 0;
    const competition = row.competition
      ? Math.round(clamp(1 - (Math.log10(Math.max(competitionRatio, 0.01)) + 2) / 4) * 100)
      : null;
    const mobile = Math.round(clamp(row.masked ? mo / Math.max(row.totalSearches, 1) : row.mobileShare) * 100);
    const weighted = demand * 0.4 + mobile * 0.15 + (competition ?? 0) * 0.45;
    const score = Math.round(weighted);
    const confidence: OpportunityScore['confidence'] = !row.competition
      ? '낮음'
      : row.masked || row.competition.lowerBound
        ? '보통'
        : '높음';
    const reasons = [
      `검색 수요 ${demand}점${row.masked ? ' (확인된 검색량 기준)' : ''}`,
      competition === null ? '블로그 경쟁 자료 없음 (경쟁 항목 가산 없음)' : `콘텐츠 경쟁 ${competition}점`,
      `모바일 비중 ${mobile}점`,
    ];

    return [row.keyword, { score, confidence, demand, competition, mobile, reasons }];
  }));
}
