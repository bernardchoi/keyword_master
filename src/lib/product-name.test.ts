import { describe, expect, it } from 'vitest';
import { analyzeName, covers, detectHead, RECOMMENDED_LEN, tokenize } from './product-name';
import { row } from './test-helpers';

describe('covers (word-break DP)', () => {
  it('토큰들을 이어 붙여 검색어를 빈틈없이 만들 수 있으면 true', () => {
    expect(covers(['여성', '여름', '원피스'], '여성여름원피스')).toBe(true);
  });

  it('토큰 일부만 있으면 못 만든다 — "포함"이 아니라 "분해 가능"을 본다', () => {
    expect(covers(['여성', '원피스'], '여성여름원피스')).toBe(false);
  });

  it('토큰과 검색어가 정확히 같으면 true', () => {
    expect(covers(['원피스'], '원피스')).toBe(true);
  });

  it('빈 검색어는 false', () => {
    expect(covers(['원피스'], '')).toBe(false);
  });

  it('토큰 안 공백은 무시하고 검색어 쪽 공백도 제거한다', () => {
    expect(covers(['여성', '원피스'], '여성 원피스')).toBe(true);
  });

  it('빈 토큰 문자열이 섞여 있어도 무한루프 없이 정상 동작한다', () => {
    expect(covers(['', '원피스'], '원피스')).toBe(true);
  });
});

describe('tokenize', () => {
  it('연속 공백을 하나의 구분자로 보고 빈 토큰을 뺀다', () => {
    expect(tokenize('  린넨   원피스  여성 ')).toEqual(['린넨', '원피스', '여성']);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('detectHead', () => {
  it('연관 키워드 대부분이 공유하는 접미사를 상품유형으로 고른다', () => {
    const keywords = [
      '린넨원피스', '여름원피스', '여성원피스', '반팔원피스',
      '나이키원피스', '플리츠원피스',
    ];
    expect(detectHead('린넨원피스', keywords)).toBe('원피스');
  });

  it('일치하는 게 2개 미만이면 null', () => {
    expect(detectHead('유니크상품', ['전혀다른키워드'])).toBeNull();
  });

  it('긴 접미사가 최댓값의 90% 이상이면 짧은 접미사 대신 긴 쪽을 고른다 (오타 흡수)', () => {
    // 실측 사례: `게이밍헤드셋` 시드에서 `무선해드셋`(해/헤 오타) 하나 때문에
    // '드셋' 접미사 카운트(36)가 '헤드셋' 접미사 카운트(35)를 앞지르지만,
    // 35 >= 36 * 0.9 이므로 더 긴 '헤드셋'을 상품유형으로 고른다.
    // ('게이밍헤드셋'을 그대로 포함하는 키워드만 쓰면 시드 전체 접미사 카운트도
    //  똑같이 높아져 검증이 안 되므로, '헤드셋'으로는 끝나되 시드 앞부분(게이밍)은
    //  공유하지 않는 다양한 수식어를 섞는다.)
    const headsetWords = [
      '무선헤드셋', '블루투스헤드셋', '유선헤드셋', '노이즈캔슬링헤드셋', '접이식헤드셋',
    ];
    const keywords = [
      ...Array.from({ length: 35 }, (_, i) => headsetWords[i % headsetWords.length]),
      '무선해드셋', // '드셋'으로는 끝나지만 '헤드셋'으로는 안 끝남 (오타)
    ];
    expect(detectHead('게이밍헤드셋', keywords)).toBe('헤드셋');
  });

  it('비율 차이가 크면(90% 미만) 실제로 다른 품목이라 짧은 접미사를 그대로 채택한다', () => {
    // 실측 사례 축소판: `선청소기` 는 `청소기`의 부분집합이지만 개수 비율이
    // 90% 를 한참 밑돌아 후보에서 걸러진다.
    const keywords = [
      ...Array(52).fill('로봇청소기'), // '청소기'로만 끝남
      ...Array(11).fill('무선핸디선청소기'), // '선청소기'(그리고 '청소기')로 끝남
    ];
    expect(detectHead('로봇청소기', keywords)).toBe('청소기');
  });
});

describe('analyzeName', () => {
  const seed = '린넨원피스';
  const rows = [
    row('린넨원피스', 5000),
    row('여름원피스', 3000),
    row('여성원피스', 2000),
    row('나이키원피스', 1500), // 브랜드 — 후보에서 빠져야 함
    row('반팔원피스', 1000),
  ];

  it('상품명 토큰으로 커버되는 검색어와 검색량을 집계한다', () => {
    const result = analyzeName('린넨 원피스', rows, seed);
    expect(result.covered.map((c) => c.keyword)).toEqual(['린넨원피스']);
    expect(result.coveredVolume).toBe(5000);
    expect(result.missedVolume).toBe(3000 + 2000 + 1500 + 1000);
  });

  it('상품유형(head)을 추정하고 같은 품목 개수를 센다', () => {
    const result = analyzeName('린넨 원피스', rows, seed);
    expect(result.head).toBe('원피스');
    expect(result.sameTypeCount).toBe(rows.length);
  });

  it('추천 단어에서 브랜드는 빠지고, 이미 넣은 토큰은 다시 추천하지 않는다', () => {
    const result = analyzeName('린넨 원피스', rows, seed);
    const tokens = result.suggestions.map((s) => s.token);
    expect(tokens).not.toContain('나이키');
    expect(tokens).not.toContain('린넨');
    expect(tokens.sort()).toEqual(['반팔', '여름', '여성'].sort());
  });

  it('추천은 글자당 이득(perChar) 내림차순으로 정렬된다', () => {
    const result = analyzeName('린넨 원피스', rows, seed);
    const tokens = result.suggestions.map((s) => s.token);
    // 여름(+3000/2자=1500) > 여성(+2000/2자=1000) > 반팔(+1000/2자=500)
    expect(tokens).toEqual(['여름', '여성', '반팔']);
  });

  it('budgetLeft 는 RECOMMENDED_LEN 에서 현재 길이를 뺀 값이다', () => {
    const name = '린넨 원피스';
    const result = analyzeName(name, rows, seed);
    expect(result.budgetLeft).toBe(RECOMMENDED_LEN - name.trim().length);
  });

  it('ownBrands 에 등록한 브랜드는 후보에서 빠지지 않는다', () => {
    const result = analyzeName('린넨 원피스', rows, seed, ['나이키']);
    expect(result.suggestions.map((s) => s.token)).toContain('나이키');
  });

  it('blockedBrands 로 보탠 단어는 코드의 BRAND_WORDS 에 없어도 후보에서 빠진다', () => {
    const rowsWithUnknownBrand = [...rows, row('무명브랜드원피스', 900)];
    const withoutBlock = analyzeName('린넨 원피스', rowsWithUnknownBrand, seed);
    expect(withoutBlock.suggestions.map((s) => s.token)).toContain('무명브랜드');

    const withBlock = analyzeName('린넨 원피스', rowsWithUnknownBrand, seed, [], ['무명브랜드']);
    expect(withBlock.suggestions.map((s) => s.token)).not.toContain('무명브랜드');
  });

  describe('checkName 이슈 검사', () => {
    it('빈 상품명은 이슈 없음', () => {
      expect(analyzeName('', rows, seed).issues).toEqual([]);
    });

    it('100자 초과와 50자 초과 경고는 독립적으로 함께 뜬다', () => {
      const longName = '가'.repeat(101);
      const issues = analyzeName(longName, [], seed).issues;
      const codes = issues.map((i) => i.code);
      expect(codes).toContain('TOO_LONG');
      expect(codes).toContain('OVER_RECOMMENDED');
    });

    it('특수문자가 있으면 SPECIAL_CHAR', () => {
      const issues = analyzeName('원피스!!', [], seed).issues;
      expect(issues.some((i) => i.code === 'SPECIAL_CHAR')).toBe(true);
    });

    it('홍보문구가 있으면 PROMO', () => {
      const issues = analyzeName('최저가 원피스', [], seed).issues;
      expect(issues.some((i) => i.code === 'PROMO')).toBe(true);
    });

    it('판매처명이 있으면 CHANNEL', () => {
      const issues = analyzeName('쿠팡 원피스', [], seed).issues;
      expect(issues.some((i) => i.code === 'CHANNEL')).toBe(true);
    });

    it('타사 브랜드는 BRAND, ownBrands 에 등록하면 통과', () => {
      const withBrand = analyzeName('나이키 원피스', [], seed).issues;
      expect(withBrand.some((i) => i.code === 'BRAND')).toBe(true);

      const owned = analyzeName('나이키 원피스', [], seed, ['나이키']).issues;
      expect(owned.some((i) => i.code === 'BRAND')).toBe(false);
    });

    it('같은 단어 반복은 DUPLICATE', () => {
      const issues = analyzeName('원피스 원피스', [], seed).issues;
      expect(issues.some((i) => i.code === 'DUPLICATE')).toBe(true);
    });

    it('품목명이 상품명에 없으면 NO_HEAD', () => {
      const issues = analyzeName('린넨 여름', rows, seed).issues;
      expect(issues.some((i) => i.code === 'NO_HEAD')).toBe(true);
    });

    it('품목명이 상품명에 있으면 NO_HEAD 없음', () => {
      const issues = analyzeName('린넨 여름 원피스', rows, seed).issues;
      expect(issues.some((i) => i.code === 'NO_HEAD')).toBe(false);
    });
  });
});
