import { BRAND_WORDS, CHANNEL_WORDS, includesAny, PROMO_WORDS } from './tag-rules';
import type { KeywordRow, TagCheckIssue } from './types';

/**
 * 상품명 최적화.
 *
 * ⚠️ 무엇을 하고 무엇을 못 하는지
 * 네이버쇼핑 랭킹은 적합도·인기도·신뢰도로 갈린다. 인기도(클릭·판매·리뷰)와
 * 신뢰도는 도구가 건드릴 수 없고, 내 상품의 실제 순위도 조회할 방법이 없다
 * (네이버가 쇼핑 상품 검색 API 를 제공하지 않는다 — `search/v1/shop` 은 404).
 * 여기서 다루는 건 **적합도 하나**, 그중에서도 판매자가 직접 고칠 수 있는
 * 상품명이다. 신규 상품에서 가장 크게 작용하는 지점이지만 전부는 아니다.
 *
 * 매칭 규칙은 네이버가 공개하지 않는다. 아래 계산은 "상품명을 토큰 묶음으로 보고
 * 질의 토큰이 전부 들어 있으면 걸린다"는 동작 기반 추정 위에 있다.
 */

/** 네이버 상품명 권장 길이. 넘으면 뒤쪽 단어의 가중치가 떨어진다. */
export const RECOMMENDED_LEN = 50;
/** 상품명 입력 한계 */
export const MAX_LEN = 100;

/**
 * 상품명 토큰들로 keyword 를 빈틈없이 쪼갤 수 있는가 (word-break DP).
 *
 * 검색광고 API 의 relKeyword 는 공백이 제거된 채로 온다(`여성여름원피스`).
 * 그래서 "포함"이 아니라 "분해 가능"으로 봐야 한다 —
 * 토큰 {여성, 여름, 원피스} 는 `여성여름원피스` 를 커버하지만,
 * {여성, 원피스} 만으로는 커버하지 못한다.
 */
export function covers(tokens: string[], keyword: string): boolean {
  const k = keyword.replace(/\s+/g, '');
  if (k.length === 0) return false;

  const reachable = new Array<boolean>(k.length + 1).fill(false);
  reachable[0] = true;

  for (let i = 0; i < k.length; i++) {
    if (!reachable[i]) continue;
    for (const t of tokens) {
      if (t && k.startsWith(t, i)) reachable[i + t.length] = true;
    }
  }
  return reachable[k.length];
}

export function tokenize(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

/**
 * 상품유형(head) 추정.
 *
 * 한국어 복합 키워드는 뒤쪽이 품목이다(`린넨원피스` → 원피스).
 * 시드의 접미사 후보 중 다른 연관 키워드의 접미사로 가장 많이 등장하는 것을 고른다.
 *
 * 이 값이 가드레일의 핵심이다. 같은 품목이 아닌 키워드를 후보에서 빼면
 * 타사 브랜드(`아이팜므`)와 다른 품목(`블라우스`)이 함께 걸러진다.
 * 검색량만 최대화하면 바로 그 둘을 추천하게 되는데, 네이버가 어뷰징으로 보는 항목이라
 * 따를수록 순위가 떨어진다.
 */
export function detectHead(seed: string, keywords: string[]): string | null {
  const s = seed.replace(/\s+/g, '');
  let best: { suffix: string; count: number } | null = null;

  for (let i = 0; i < s.length - 1; i++) {
    const suffix = s.slice(i);
    if (suffix.length < 2) continue;
    const count = keywords.filter((k) => k.endsWith(suffix)).length;
    if (!best || count > best.count || (count === best.count && suffix.length > best.suffix.length)) {
      best = { suffix, count };
    }
  }
  return best && best.count >= 2 ? best.suffix : null;
}

export interface Suggestion {
  token: string;
  /** 이 토큰을 넣었을 때 늘어나는 커버 검색량 */
  gain: number;
  /** 글자당 이득 — 상품명은 길이 예산이 있으므로 이 값으로 고른다 */
  perChar: number;
  /** 이 토큰 덕에 새로 걸리는 키워드 (상위 몇 개) */
  unlocks: string[];
  /** 단독으로도 검색되는 말 — 브랜드·고유명사일 수 있어 확인이 필요하다 */
  standalone: boolean;
}

export interface CoveredKeyword {
  keyword: string;
  totalSearches: number;
  /** 경쟁강도 등급 (문서수를 못 가져온 행은 null) */
  grade: string | null;
}

export interface NameAnalysis {
  tokens: string[];
  length: number;
  /** 추정 상품유형. 못 찾으면 null */
  head: string | null;
  /** 연관 키워드 중 같은 품목인 개수 */
  sameTypeCount: number;
  covered: CoveredKeyword[];
  coveredVolume: number;
  /** 아직 못 걸린 키워드 중 검색량 상위 */
  missed: CoveredKeyword[];
  missedVolume: number;
  suggestions: Suggestion[];
  issues: TagCheckIssue[];
}

const toCovered = (r: KeywordRow): CoveredKeyword => ({
  keyword: r.keyword,
  totalSearches: r.totalSearches,
  grade: r.competition?.grade ?? null,
});

/** 상품명에 쓸 수 없는 말인지 — 홍보문구·판매처·타사 브랜드 */
function blockedWord(token: string, ownBrands: string[]): string | null {
  const own = ownBrands.map((b) => b.toLowerCase().replace(/\s+/g, ''));
  const brand = includesAny(token, BRAND_WORDS);
  if (brand && !own.includes(brand.toLowerCase().replace(/\s+/g, ''))) return brand;
  return includesAny(token, PROMO_WORDS) ?? includesAny(token, CHANNEL_WORDS);
}

export function analyzeName(
  name: string,
  rows: KeywordRow[],
  seed: string,
  ownBrands: string[] = [],
): NameAnalysis {
  const tokens = tokenize(name);
  const keywords = rows.map((r) => r.keyword);
  const head = detectHead(seed, keywords);
  const sameType = head ? rows.filter((r) => r.keyword.endsWith(head)) : rows;

  const covered = rows.filter((r) => covers(tokens, r.keyword));
  const coveredSet = new Set(covered.map((r) => r.keyword));
  const missed = rows.filter((r) => !coveredSet.has(r.keyword));
  const coveredVolume = covered.reduce((s, r) => s + r.totalSearches, 0);

  // ── 추천 토큰 ────────────────────────────────────────────────
  // 후보는 "같은 품목 키워드에서 head 를 뗀 수식어"뿐이다.
  const standalone = new Set(keywords);
  const candidates = new Set<string>();
  for (const r of sameType) {
    const prefix = head ? r.keyword.slice(0, r.keyword.length - head.length) : r.keyword;
    if (prefix.length >= 2 && prefix.length <= 6) candidates.add(prefix);
  }
  // head 자체가 상품명에 없으면 그것부터 넣어야 한다
  if (head && !tokens.includes(head)) candidates.add(head);

  const suggestions: Suggestion[] = [];
  for (const token of candidates) {
    if (tokens.includes(token)) continue;
    if (blockedWord(token, ownBrands)) continue;

    const next = [...tokens, token];
    const unlocked = missed.filter((r) => covers(next, r.keyword));
    const gain = unlocked.reduce((s, r) => s + r.totalSearches, 0);
    if (gain <= 0) continue;

    suggestions.push({
      token,
      gain,
      perChar: Math.round(gain / token.length),
      unlocks: unlocked.slice(0, 4).map((r) => r.keyword),
      standalone: standalone.has(token),
    });
  }
  // 확인이 필요한 후보(단독으로도 검색되는 말)는 값이 커도 아래로 내린다.
  // `강아지사료` 에서 `동물병원` 이 글자당 이득 1위로 올라오는데, 품목 필터를
  // 통과했을 뿐(`동물병원사료` 라는 키워드가 있다) 사료 상품명에 넣을 말이 아니다.
  // 맨 위에 두면 그대로 따라 쓰게 되므로, 확실한 수식어부터 보여 준다.
  suggestions.sort(
    (a, b) =>
      Number(a.standalone) - Number(b.standalone) ||
      b.perChar - a.perChar ||
      b.gain - a.gain,
  );

  return {
    tokens,
    length: name.trim().length,
    head,
    sameTypeCount: sameType.length,
    covered: covered.map(toCovered),
    coveredVolume,
    missed: missed.slice(0, 12).map(toCovered),
    missedVolume: missed.reduce((s, r) => s + r.totalSearches, 0),
    suggestions: suggestions.slice(0, 12),
    issues: checkName(name, tokens, head, ownBrands),
  };
}

/** 스마트스토어 상품명 작성 규칙 검사 */
function checkName(
  name: string,
  tokens: string[],
  head: string | null,
  ownBrands: string[],
): TagCheckIssue[] {
  const issues: TagCheckIssue[] = [];
  const push = (level: TagCheckIssue['level'], code: string, message: string) =>
    issues.push({ level, code, message });

  const trimmed = name.trim();
  if (trimmed.length === 0) return issues;

  if (trimmed.length > MAX_LEN) {
    push('block', 'TOO_LONG', `상품명은 최대 ${MAX_LEN}자입니다 (현재 ${trimmed.length}자).`);
  } else if (trimmed.length > RECOMMENDED_LEN) {
    push(
      'warn',
      'OVER_RECOMMENDED',
      `${RECOMMENDED_LEN}자를 넘으면 뒤쪽 단어의 가중치가 떨어집니다 (현재 ${trimmed.length}자).`,
    );
  }

  const badChars = trimmed.match(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ \-.+&/()]/g);
  if (badChars) {
    push(
      'block',
      'SPECIAL_CHAR',
      `상품명에 쓸 수 없는 문자가 있습니다: ${[...new Set(badChars)].join(' ')}`,
    );
  }

  const promo = includesAny(trimmed, PROMO_WORDS);
  if (promo) push('block', 'PROMO', `홍보성 문구는 상품명에 쓸 수 없습니다: "${promo}"`);

  const channel = includesAny(trimmed, CHANNEL_WORDS);
  if (channel) push('block', 'CHANNEL', `판매처·플랫폼명은 쓸 수 없습니다: "${channel}"`);

  const own = ownBrands.map((b) => b.toLowerCase().replace(/\s+/g, ''));
  const brand = includesAny(trimmed, BRAND_WORDS);
  if (brand && !own.includes(brand.toLowerCase().replace(/\s+/g, ''))) {
    push(
      'block',
      'BRAND',
      `타사 상표로 보입니다: "${brand}". 직접 취급하는 브랜드가 아니면 제재 대상입니다.`,
    );
  }

  // 같은 단어를 반복해도 가중치가 올라가지 않는다. 길이만 먹는다.
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const t of tokens) {
    if (seen.has(t)) dups.add(t);
    seen.add(t);
  }
  if (dups.size > 0) {
    push('warn', 'DUPLICATE', `같은 단어가 반복됩니다: ${[...dups].join(', ')}. 길이만 낭비합니다.`);
  }

  if (head && !tokens.includes(head)) {
    push(
      'warn',
      'NO_HEAD',
      `상품유형("${head}")이 하나의 단어로 들어 있지 않습니다. 품목명은 띄어 써야 검색어에 걸립니다.`,
    );
  }

  return issues;
}
