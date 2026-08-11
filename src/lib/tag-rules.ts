import type { Seasonality, TagCheckIssue, TagCheckResult } from './types';

/**
 * ⚠️ 중요한 전제
 * 네이버는 "이 단어가 스마트스토어 태그로 등록 가능한지"를 알려 주는 공개 API 를
 * 제공하지 않는다. 여기서는 (1) 스마트스토어 상품등록 정책에 명시된 규칙을
 * 코드로 옮기고, (2) 검색광고 API 의 월간 검색수와 3년치 추이로 계산한 시즌성을
 * 근거로 붙여 "등록 가능 / 주의 / 불가" 를 추정한다. 최종 판정은 스마트스토어
 * 상품등록 화면에서 확인해야 한다.
 *
 * 등록 상품수·카테고리 집중도를 근거로 쓰던 규칙(NO_PRODUCT / NICHE /
 * AMBIGUOUS_CATEGORY)은 뺐다. 네이버가 쇼핑(상품) 검색 API 를 내려서
 * 그 수치를 얻을 방법이 없어졌기 때문이다.
 */

/** 홍보성·판매유도 문구는 태그·상품명 어느 쪽에도 쓸 수 없다 */
export const PROMO_WORDS = [
  '최저가', '무료배송', '당일배송', '정품', '초특가', '특가', '할인', '세일',
  '이벤트', '사은품', '적립', '쿠폰', '베스트', '인기', '추천', '1위', '１위',
  '핫딜', '땡처리', '떨이', '재고정리', '품절임박', '한정판매', '단독',
  '공식', '공식판매처', '본사', '직영', '정식수입', '병행수입',
];

/** 판매처/플랫폼명은 태그·상품명 어느 쪽에도 쓸 수 없다 */
export const CHANNEL_WORDS = [
  '스마트스토어', '스토어팜', '네이버', '쿠팡', '11번가', '지마켓', 'gmarket',
  '옥션', '위메프', '티몬', '인터파크', 'ssg', '쓱', '롯데온', '무신사',
  '알리', '알리익스프레스', '테무', '아마존', '이베이',
];

/** 대표적인 타사 상표 (직접 취급 브랜드가 아니면 태그 사용 시 제재 대상) */
export const BRAND_WORDS = [
  '나이키', 'nike', '아디다스', 'adidas', '샤넬', 'chanel', '구찌', 'gucci',
  '루이비통', 'louisvuitton', '애플', 'apple', '아이폰', 'iphone', '갤럭시',
  'galaxy', '삼성', '엘지', 'lg', '다이슨', 'dyson', '스타벅스', 'starbucks',
  '레고', 'lego', '디즈니', 'disney', '뉴발란스', 'newbalance', '노스페이스',
];

/** 시즌·이벤트성 키워드는 시기와 맞지 않으면 어뷰징으로 판단될 수 있다 */
const SEASONAL_WORDS = [
  '크리스마스', '설날', '추석', '발렌타인', '화이트데이', '빼빼로데이',
  '블랙프라이데이', '수능', '어버이날', '스승의날', '어린이날', '핼러윈', '할로윈',
];

const MAX_LEN = 20;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function includesAny(haystack: string, words: string[]): string | null {
  const lower = haystack.toLowerCase().replace(/\s+/g, '');
  for (const w of words) {
    if (lower.includes(w.toLowerCase().replace(/\s+/g, ''))) return w;
  }
  return null;
}

export interface TagCheckInput {
  tag: string;
  monthlySearches: number | null;
  /** 내가 실제로 취급하는 브랜드 — 오탐 방지용 화이트리스트 */
  ownBrands?: string[];
  /** 실제 3년치 추이로 계산한 시즌성. 단어 목록보다 우선한다. */
  seasonality?: Seasonality | null;
}

export function checkShoppingTag(input: TagCheckInput): TagCheckResult {
  const normalized = normalizeTag(input.tag);
  const issues: TagCheckIssue[] = [];
  let score = 100;

  const push = (level: TagCheckIssue['level'], code: string, message: string, penalty: number) => {
    issues.push({ level, code, message });
    score -= penalty;
  };

  // ── 1. 형식 규칙 (스마트스토어 상품등록 정책) ──────────────────
  if (normalized.length === 0) {
    push('block', 'EMPTY', '태그가 비어 있습니다.', 100);
  } else if (normalized.length > MAX_LEN) {
    push('block', 'TOO_LONG', `태그는 최대 ${MAX_LEN}자입니다 (현재 ${normalized.length}자).`, 100);
  }

  if (normalized.length === 1) {
    push('warn', 'TOO_SHORT', '한 글자 태그는 검색에 거의 반영되지 않습니다.', 25);
  }

  const badChars = normalized.match(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ ]/g);
  if (badChars) {
    push(
      'block',
      'SPECIAL_CHAR',
      `사용할 수 없는 문자가 있습니다: ${[...new Set(badChars)].join(' ')}`,
      100,
    );
  }

  if (normalized.includes(' ')) {
    push('warn', 'HAS_SPACE', '태그는 띄어쓰기 없이 붙여 쓰는 것이 검색 매칭에 유리합니다.', 15);
  }

  // ── 2. 금지 유형 ──────────────────────────────────────────────
  const promo = includesAny(normalized, PROMO_WORDS);
  if (promo) push('block', 'PROMO', `홍보성 문구는 태그로 사용할 수 없습니다: "${promo}"`, 60);

  const channel = includesAny(normalized, CHANNEL_WORDS);
  if (channel) push('block', 'CHANNEL', `판매처·플랫폼명은 사용할 수 없습니다: "${channel}"`, 60);

  const own = (input.ownBrands ?? []).map((b) => b.toLowerCase().replace(/\s+/g, ''));
  const brand = includesAny(normalized, BRAND_WORDS);
  if (brand && !own.includes(brand.toLowerCase().replace(/\s+/g, ''))) {
    push(
      'block',
      'BRAND',
      `타사 상표로 보입니다: "${brand}". 직접 취급하는 브랜드가 아니면 제재 대상입니다.`,
      55,
    );
  }

  // 시즌성: 실제 추이 데이터가 있으면 그것을 쓰고, 없을 때만 단어 목록으로 떨어진다.
  // 단어 목록은 `린넨원피스` 처럼 계절을 크게 타면서 시즌 단어가 안 들어간 키워드를 놓친다.
  const season = input.seasonality;
  if (season && season.level !== '없음') {
    const peaks = season.peakMonths.map((m) => `${m}월`).join('·');
    if (season.currentPhase === '비수기') {
      push(
        'warn',
        'SEASONAL_OFF',
        `계절을 타는 키워드입니다 (성수기 ${peaks}). 지금은 비수기라 태그 효과가 낮습니다.`,
        20,
      );
    } else {
      push(
        'info',
        'SEASONAL_ON',
        `계절을 타는 키워드입니다 (성수기 ${peaks}, 현재 ${season.currentPhase}).`,
        0,
      );
    }
  } else if (!season) {
    const word = includesAny(normalized, SEASONAL_WORDS);
    if (word) {
      push('warn', 'SEASONAL', `시즌성 키워드입니다: "${word}". 해당 시기 외에는 사용을 피하세요.`, 20);
    }
  }

  if (/^\d+$/.test(normalized)) {
    push('warn', 'NUMERIC_ONLY', '숫자로만 이루어진 태그는 검색 매칭이 어렵습니다.', 25);
  }

  // ── 3. 검색 데이터 기반 근거 ──────────────────────────────────
  if (input.monthlySearches !== null && input.monthlySearches < 30) {
    push('info', 'LOW_VOLUME', '월간 검색수가 매우 낮아 태그 효과가 제한적입니다.', 10);
  }

  score = Math.max(0, Math.min(100, score));

  const hasBlock = issues.some((i) => i.level === 'block');
  const hasWarn = issues.some((i) => i.level === 'warn');
  const verdict: TagCheckResult['verdict'] = hasBlock
    ? '등록 불가'
    : hasWarn
      ? '주의 필요'
      : '등록 가능';

  if (issues.length === 0) {
    issues.push({ level: 'info', code: 'OK', message: '정책 위반 사항이 발견되지 않았습니다.' });
  }

  return {
    tag: input.tag,
    normalized,
    verdict,
    score,
    issues,
    evidence: {
      monthlySearches: input.monthlySearches,
    },
  };
}
