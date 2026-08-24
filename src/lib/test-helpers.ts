import type { KeywordRow } from './types';

/**
 * 테스트용 KeywordRow 팩토리. 필요한 필드만 넘기면 나머지는 합리적인 기본값을 채운다.
 * 실제 API 응답 형태를 그대로 흉내 내되, 테스트에서는 대개 keyword/totalSearches/
 * grade/masked 정도만 관심사이므로 나머지는 노이즈를 줄이기 위해 감춘다.
 */
export function row(
  keyword: string,
  totalSearches: number,
  opts: Partial<Pick<KeywordRow, 'masked' | 'rank' | 'isSeed'>> = {},
): KeywordRow {
  const pc = Math.round(totalSearches * 0.4);
  const mobile = totalSearches - pc;
  return {
    keyword,
    pcSearches: pc,
    mobileSearches: mobile,
    totalSearches,
    mobileShare: totalSearches > 0 ? mobile / totalSearches : 0,
    pcClicks: 0,
    mobileClicks: 0,
    pcCtr: 0,
    mobileCtr: 0,
    adDepth: 0,
    compIdx: '중간',
    masked: opts.masked ?? false,
    docs: null,
    competition: null,
    rank: opts.rank ?? 1,
    isSeed: opts.isSeed ?? false,
  };
}

/** 경쟁강도 등급까지 채운 KeywordRow */
export function rowWithGrade(
  keyword: string,
  totalSearches: number,
  grade: '최고' | '좋음' | '보통' | '나쁨' | '최악',
  opts: Partial<Pick<KeywordRow, 'masked'>> = {},
): KeywordRow {
  const base = row(keyword, totalSearches, opts);
  return {
    ...base,
    docs: { blog: 0 },
    competition: { ratio: 0, grade, lowerBound: opts.masked ?? false },
  };
}
