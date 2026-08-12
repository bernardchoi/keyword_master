import { BRAND_WORDS, CHANNEL_WORDS, includesAny, PROMO_WORDS } from './tag-rules';
import { covers, detectHead, tokenize } from './product-name';
import type { Grade, KeywordRow } from './types';

/**
 * 태그 후보 추천.
 *
 * 스마트스토어 태그는 **10개가 전부**라, 문제는 "이 태그가 괜찮은가"(기존 검사기)가
 * 아니라 "그 10칸을 어디에 쓸 것인가"다. 그래서 세 가지를 뺀다.
 *
 *  1. 상품명이 이미 걸어 둔 검색어 — 태그로 또 넣으면 슬롯만 낭비다.
 *  2. 다른 품목 — `원피스` 상품에 `블라우스` 태그는 어뷰징이다.
 *  3. 정책 위반 — 홍보문구·판매처명·알려진 타사 상표.
 *
 * 남은 후보는 검색량에 경쟁강도 가중치를 곱해 정렬한다. 검색량만 보면 이미
 * 포화된 대형 키워드에 10칸을 다 써 버린다. 실측(`린넨원피스`): 경쟁을 반영하면
 * `샤틴원피스`(10,150·보통)가 2위로 올라오고 `휴양지원피스`(19,350·최악)가 5위로 밀린다.
 *
 * ⚠️ 자동으로 10개를 확정하지 않는다. 걸러 낸 뒤에도 `고양이사료`(강아지 상품인데
 * 대상이 다름)나 `나우사료`(목록에 없는 타사 브랜드) 같은 후보가 남는다.
 * 최종 선택은 사람이 해야 하며, 이 함수는 근거를 붙인 후보 목록까지만 만든다.
 */

/** 스마트스토어 태그 1개 최대 길이 */
export const TAG_MAX_LEN = 20;
/** 상품당 태그 슬롯 */
export const TAG_SLOTS = 10;

/**
 * 경쟁등급 → 진입 가능성 가중치.
 * 검색량이 두 배여도 등급이 두 단계 나쁘면 실제 노출 기대값은 더 낮다고 본다.
 */
const GRADE_WEIGHT: Record<Grade, number> = {
  최고: 1,
  좋음: 0.8,
  보통: 0.5,
  나쁨: 0.25,
  최악: 0.1,
};

/** 경쟁강도를 모르거나 검색수가 마스킹돼 등급을 믿을 수 없을 때 */
const UNKNOWN_WEIGHT = 0.1;

export interface TagCandidate {
  tag: string;
  totalSearches: number;
  grade: Grade | null;
  /** 검색량 × 경쟁 가중치 */
  score: number;
  /** 검색수가 마스킹돼 등급이 하한인 키워드 */
  uncertain: boolean;
}

export interface TagSuggestion {
  /** 상품유형(head). 못 찾으면 null — 이때는 품목 필터를 걸지 않는다 */
  head: string | null;
  candidates: TagCandidate[];
  /** 상품명이 이미 커버해서 뺀 개수 */
  droppedInName: number;
  /** 다른 품목이라 뺀 개수 */
  droppedOffType: number;
  /** 정책 위반으로 뺀 개수 */
  droppedBlocked: number;
}

function blocked(tag: string, ownBrands: string[]): boolean {
  const own = ownBrands.map((b) => b.toLowerCase().replace(/\s+/g, ''));
  const brand = includesAny(tag, BRAND_WORDS);
  if (brand && !own.includes(brand.toLowerCase().replace(/\s+/g, ''))) return true;
  return Boolean(includesAny(tag, PROMO_WORDS) ?? includesAny(tag, CHANNEL_WORDS));
}

export function suggestTags(
  rows: KeywordRow[],
  seed: string,
  productName: string,
  ownBrands: string[] = [],
): TagSuggestion {
  const head = detectHead(seed, rows.map((r) => r.keyword));
  const nameTokens = tokenize(productName);

  let droppedInName = 0;
  let droppedOffType = 0;
  let droppedBlocked = 0;
  const candidates: TagCandidate[] = [];

  for (const r of rows) {
    // 상품명이 이미 걸어 둔 검색어는 태그 슬롯을 쓸 이유가 없다
    if (nameTokens.length > 0 && covers(nameTokens, r.keyword)) {
      droppedInName++;
      continue;
    }
    if (head && !r.keyword.endsWith(head)) {
      droppedOffType++;
      continue;
    }
    if (r.keyword.length > TAG_MAX_LEN) continue;
    if (blocked(r.keyword, ownBrands)) {
      droppedBlocked++;
      continue;
    }

    const grade = r.competition?.grade ?? null;
    const uncertain = r.masked || r.competition === null;
    const weight = grade && !uncertain ? GRADE_WEIGHT[grade] : UNKNOWN_WEIGHT;

    candidates.push({
      tag: r.keyword,
      totalSearches: r.totalSearches,
      grade,
      score: Math.round(r.totalSearches * weight),
      uncertain,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.totalSearches - a.totalSearches);

  return { head, candidates, droppedInName, droppedOffType, droppedBlocked };
}
