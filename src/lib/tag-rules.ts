import { BRAND_WORDS, CHANNEL_WORDS, PROMO_WORDS, SEASONAL_WORDS, withCustomBrandWords } from './brand-data';
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
 *
 * 정책 단어 목록(홍보문구·판매처명·타사 브랜드)은 `brand-data.ts` 에 있다.
 * **후보에 남은 브랜드는 사람이 걸러야 한다** — 목록은 완전할 수 없고, 화면의
 * "직접 확인한 타사 브랜드 추가" 칸으로 그때그때 보탤 수 있다.
 */
export { BRAND_WORDS, CHANNEL_WORDS, PROMO_WORDS };

const MAX_LEN = 20;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * 태그 입력을 목록으로 쪼갠다.
 *
 * 스마트스토어 상품등록 화면의 태그를 그대로 복사하면
 * `# 게이밍헤드셋 ×# 무선게이밍헤드셋 ×# 블루투스헤드셋 ×` 처럼 붙는다.
 * `#` 는 태그 시작 표시고 `×` 는 삭제 버튼 글리프다. 줄바꿈·쉼표만 구분자로 보면
 * 이 덩어리 전체가 태그 1개로 잡히므로 둘 다 구분자로 취급한다.
 *
 * 삭제 버튼이 ASCII `x` 로 복사되는 경우도 있어 **앞뒤가 공백으로 끊긴 x** 만 떼어 낸다
 * (`xl사이즈` 같은 정상 태그를 건드리지 않기 위해).
 */
export function parseTags(raw: string): string[] {
  return raw
    .replace(/[#×✕✖⨯]/g, '\n')
    .split(/[\n,]/)
    // 룩비하인드는 구형 Safari 에서 파싱 자체가 깨지므로 쓰지 않는다
    .map((t) => t.trim().replace(/^[xX](?=\s)/, '').replace(/\s[xX]$/, '').trim())
    .filter((t) => t.length > 0 && t !== 'x' && t !== 'X');
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
  /**
   * 코드의 `BRAND_WORDS` 에 없는 타사 브랜드를 사용자가 직접 보탠 목록.
   * `brand-data.ts` 의 목록과 합쳐서 검사한다.
   */
  blockedBrands?: string[];
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
  const brand = includesAny(normalized, withCustomBrandWords(input.blockedBrands ?? []));
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
