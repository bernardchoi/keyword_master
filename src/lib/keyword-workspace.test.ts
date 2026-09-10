import { describe, expect, it } from 'vitest';
import { applyKeywordFilters, EMPTY_FILTERS, filtersFromSearchParams, writeFiltersToSearchParams } from './keyword-workspace';
import type { KeywordRow } from './types';

function row(overrides: Partial<KeywordRow>): KeywordRow {
  return {
    keyword: '키워드', pcSearches: 400, mobileSearches: 600, totalSearches: 1000,
    mobileShare: 0.6, pcClicks: 0, mobileClicks: 0, pcCtr: 0, mobileCtr: 0,
    adDepth: 0, compIdx: '중간', masked: false, docs: { blog: 500 },
    competition: { ratio: 0.5, grade: '좋음', lowerBound: false }, rank: 1, isSeed: false,
    ...overrides,
  };
}

describe('applyKeywordFilters', () => {
  const rows = [
    row({ keyword: '모바일 텐트', mobileShare: 0.8, totalSearches: 2000 }),
    row({ keyword: '캠핑 의자', competition: { ratio: 2, grade: '나쁨', lowerBound: false } }),
    row({ keyword: '자료 없음', docs: null, competition: null }),
  ];

  it('검색량·경쟁·모바일 조건을 함께 적용한다', () => {
    const filters = { ...EMPTY_FILTERS, minSearches: '1500', maxSearches: '3000', maxCompetition: '1', minMobileShare: '70' };
    expect(applyKeywordFilters(rows, filters, () => false).map((r) => r.keyword)).toEqual(['모바일 텐트']);
  });

  it('자료 없는 경쟁강도를 0으로 취급하지 않는다', () => {
    const filters = { ...EMPTY_FILTERS, maxCompetition: '1' };
    expect(applyKeywordFilters(rows, filters, () => false).map((r) => r.keyword)).not.toContain('자료 없음');
  });

  it('즐겨찾기 조건을 적용한다', () => {
    const filters = { ...EMPTY_FILTERS, favoritesOnly: true };
    expect(applyKeywordFilters(rows, filters, (keyword) => keyword === '캠핑 의자')).toHaveLength(1);
  });
});

describe('filter URL state', () => {
  it('필터를 URL에 기록하고 다시 읽는다', () => {
    const filters = { ...EMPTY_FILTERS, query: '텐트', minSearches: '100', maxSearches: '5000', completeDataOnly: true };
    const params = writeFiltersToSearchParams(new URLSearchParams('q=캠핑'), filters);
    expect(params.get('q')).toBe('캠핑');
    expect(filtersFromSearchParams(params)).toEqual(filters);
  });
});
