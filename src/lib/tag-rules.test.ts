import { describe, expect, it } from 'vitest';
import { checkShoppingTag, includesAny, parseTags } from './tag-rules';

describe('includesAny', () => {
  it('대소문자·공백을 무시하고 매칭한다', () => {
    expect(includesAny('ADIDAS 운동화', ['adidas'])).toBe('adidas');
    expect(includesAny('나 이 키 신발', ['나이키'])).toBe('나이키');
  });

  it('매칭되는 게 없으면 null', () => {
    expect(includesAny('원피스', ['나이키', '아디다스'])).toBeNull();
  });
});

describe('parseTags', () => {
  it('스마트스토어 태그 화면을 그대로 복사한 형태(# 와 × 로 구분)를 분해한다', () => {
    const raw = '#게이밍헤드셋 ×#무선게이밍헤드셋 ×#블루투스헤드셋 ×';
    expect(parseTags(raw)).toEqual(['게이밍헤드셋', '무선게이밍헤드셋', '블루투스헤드셋']);
  });

  it('줄바꿈·쉼표 구분자도 지원한다', () => {
    expect(parseTags('태그1\n태그2,태그3')).toEqual(['태그1', '태그2', '태그3']);
  });

  it('앞뒤가 공백으로 끊긴 ASCII x(삭제 버튼 글리프)만 떼어내고, xl사이즈 같은 정상 단어는 보존한다', () => {
    const raw = '태그1 x, xl사이즈, x 태그2';
    expect(parseTags(raw)).toEqual(['태그1', 'xl사이즈', '태그2']);
  });

  it('빈 항목은 걸러진다', () => {
    expect(parseTags('태그1,, ,태그2')).toEqual(['태그1', '태그2']);
  });
});

describe('checkShoppingTag', () => {
  it('정상 태그는 등록 가능 · 점수 100', () => {
    const result = checkShoppingTag({ tag: '겨울원피스', monthlySearches: 500 });
    expect(result.verdict).toBe('등록 가능');
    expect(result.score).toBe(100);
    expect(result.issues.map((i) => i.code)).toEqual(['OK']);
  });

  it('띄어쓰기가 있으면 경고(주의 필요)로 내려간다', () => {
    const result = checkShoppingTag({ tag: '겨울 원피스', monthlySearches: 500 });
    expect(result.verdict).toBe('주의 필요');
    expect(result.issues.some((i) => i.code === 'HAS_SPACE')).toBe(true);
  });

  it('20자를 넘으면 등록 불가', () => {
    const result = checkShoppingTag({ tag: '아'.repeat(21), monthlySearches: 500 });
    expect(result.verdict).toBe('등록 불가');
    expect(result.issues.some((i) => i.code === 'TOO_LONG')).toBe(true);
  });

  it('홍보문구는 등록 불가', () => {
    const result = checkShoppingTag({ tag: '최저가원피스', monthlySearches: 500 });
    expect(result.verdict).toBe('등록 불가');
    expect(result.issues.some((i) => i.code === 'PROMO')).toBe(true);
  });

  it('판매처명은 등록 불가', () => {
    const result = checkShoppingTag({ tag: '쿠팡원피스', monthlySearches: 500 });
    expect(result.verdict).toBe('등록 불가');
    expect(result.issues.some((i) => i.code === 'CHANNEL')).toBe(true);
  });

  it('타사 브랜드는 등록 불가, ownBrands 에 넣으면 통과', () => {
    const blocked = checkShoppingTag({ tag: '나이키원피스', monthlySearches: 500 });
    expect(blocked.verdict).toBe('등록 불가');

    const owned = checkShoppingTag({
      tag: '나이키원피스',
      monthlySearches: 500,
      ownBrands: ['나이키'],
    });
    expect(owned.issues.some((i) => i.code === 'BRAND')).toBe(false);
  });

  it('숫자로만 이루어진 태그는 경고', () => {
    const result = checkShoppingTag({ tag: '12345', monthlySearches: 500 });
    expect(result.issues.some((i) => i.code === 'NUMERIC_ONLY')).toBe(true);
    expect(result.verdict).toBe('주의 필요');
  });

  it('검색수가 낮아도 info 등급이라 등록 가능 판정은 유지된다', () => {
    const result = checkShoppingTag({ tag: '희귀원피스', monthlySearches: 5 });
    expect(result.issues.some((i) => i.code === 'LOW_VOLUME')).toBe(true);
    expect(result.verdict).toBe('등록 가능');
  });

  it('시즌성 데이터가 있고 지금이 비수기면 SEASONAL_OFF 경고', () => {
    const result = checkShoppingTag({
      tag: '패딩원피스',
      monthlySearches: 500,
      seasonality: {
        monthly: [],
        peakMonths: [12],
        lowMonths: [7],
        amplitude: 0.9,
        level: '뚜렷',
        currentPhase: '비수기',
        monthsToPeak: 3,
      },
    });
    expect(result.issues.some((i) => i.code === 'SEASONAL_OFF')).toBe(true);
    expect(result.verdict).toBe('주의 필요');
  });

  it('시즌성 데이터가 없을 때만 단어 목록(SEASONAL)으로 대체 판정한다', () => {
    const result = checkShoppingTag({ tag: '크리스마스원피스', monthlySearches: 500 });
    expect(result.issues.some((i) => i.code === 'SEASONAL')).toBe(true);
  });

  it('실제 시즌성 데이터가 있으면 단어 목록 판정보다 우선한다', () => {
    // '크리스마스'라는 단어가 들어 있어도, 실측 시즌성이 성수기면 경고를 내지 않는다.
    const result = checkShoppingTag({
      tag: '크리스마스원피스',
      monthlySearches: 500,
      seasonality: {
        monthly: [],
        peakMonths: [12],
        lowMonths: [7],
        amplitude: 0.9,
        level: '뚜렷',
        currentPhase: '성수기',
        monthsToPeak: 0,
      },
    });
    expect(result.issues.some((i) => i.code === 'SEASONAL')).toBe(false);
    expect(result.issues.some((i) => i.code === 'SEASONAL_ON')).toBe(true);
  });
});
