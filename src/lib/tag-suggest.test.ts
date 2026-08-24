import { describe, expect, it } from 'vitest';
import { suggestTags, TAG_MAX_LEN } from './tag-suggest';
import { row, rowWithGrade } from './test-helpers';

const seed = '린넨원피스';

describe('suggestTags', () => {
  it('상품명이 이미 커버하는 검색어는 후보에서 빼고 droppedInName 으로 센다', () => {
    const rows = [rowWithGrade('린넨원피스', 5000, '보통')];
    const result = suggestTags(rows, seed, '린넨 원피스');
    expect(result.candidates).toHaveLength(0);
    expect(result.droppedInName).toBe(1);
  });

  it('다른 품목(head 불일치)은 droppedOffType 으로 센다', () => {
    // head 추정에는 같은 품목 키워드가 최소 2개 필요하므로 원피스 키워드를 2개 넣어 둔다.
    const rows = [
      rowWithGrade('린넨원피스', 5000, '보통'),
      rowWithGrade('여름원피스', 3000, '보통'),
      rowWithGrade('여성블라우스', 4000, '보통'), // 다른 품목
    ];
    const result = suggestTags(rows, seed, '');
    expect(result.head).toBe('원피스');
    expect(result.candidates.map((c) => c.tag)).not.toContain('여성블라우스');
    expect(result.droppedOffType).toBe(1);
  });

  it('정책 위반(브랜드·홍보문구)은 droppedBlocked 으로 센다', () => {
    const rows = [
      rowWithGrade('나이키원피스', 3000, '좋음'), // 타사 브랜드
      rowWithGrade('베스트원피스', 2000, '좋음'), // 홍보문구 '베스트'
    ];
    const result = suggestTags(rows, seed, '');
    expect(result.candidates).toHaveLength(0);
    expect(result.droppedBlocked).toBe(2);
  });

  it('ownBrands 에 등록한 브랜드는 막지 않는다', () => {
    const rows = [rowWithGrade('나이키원피스', 3000, '좋음')];
    const result = suggestTags(rows, seed, '', ['나이키']);
    expect(result.candidates).toHaveLength(1);
    expect(result.droppedBlocked).toBe(0);
  });

  it(`${TAG_MAX_LEN}자를 넘는 태그는 그냥 빠진다 (드롭 카운터에 안 잡힘)`, () => {
    const longTag = '아'.repeat(TAG_MAX_LEN + 1) + '원피스';
    const rows = [rowWithGrade(longTag, 1000, '보통')];
    const result = suggestTags(rows, seed, '');
    expect(result.candidates).toHaveLength(0);
    expect(result.droppedInName).toBe(0);
    expect(result.droppedOffType).toBe(0);
    expect(result.droppedBlocked).toBe(0);
  });

  it('점수 = 검색량 × 경쟁가중치. 검색량이 커도 경쟁이 나쁘면 순위가 밀린다', () => {
    // 실측 패턴 재현: 검색량만 보면 휴양지원피스(20000) > 여름원피스(10000) > 샤틴원피스(6000) 지만
    // 경쟁 가중치를 곱하면 여름원피스 > 샤틴원피스 > 휴양지원피스 순으로 뒤집힌다.
    const rows = [
      rowWithGrade('휴양지원피스', 20000, '최악'), // ×0.1 = 2000
      rowWithGrade('여름원피스', 10000, '보통'),   // ×0.5 = 5000
      rowWithGrade('샤틴원피스', 6000, '좋음'),    // ×0.8 = 4800
    ];
    const result = suggestTags(rows, seed, '');
    expect(result.candidates.map((c) => c.tag)).toEqual(['여름원피스', '샤틴원피스', '휴양지원피스']);
    expect(result.candidates[0].score).toBe(5000);
    expect(result.candidates[1].score).toBe(4800);
    expect(result.candidates[2].score).toBe(2000);
  });

  it('검색수가 마스킹된 키워드는 등급이 있어도 uncertain=true, 가중치는 UNKNOWN_WEIGHT', () => {
    const rows = [rowWithGrade('마스킹원피스', 100, '최고', { masked: true })];
    const result = suggestTags(rows, seed, '');
    expect(result.candidates[0].uncertain).toBe(true);
    expect(result.candidates[0].score).toBe(Math.round(100 * 0.1));
  });

  it('경쟁강도를 모르는(docs 조회 실패) 키워드도 UNKNOWN_WEIGHT 로 처리한다', () => {
    const rows = [row('미분석원피스', 100)]; // competition: null
    const result = suggestTags(rows, seed, '');
    expect(result.candidates[0].grade).toBeNull();
    expect(result.candidates[0].uncertain).toBe(true);
    expect(result.candidates[0].score).toBe(Math.round(100 * 0.1));
  });

  it('head 를 못 찾으면(null) 품목 필터를 걸지 않는다', () => {
    const rows = [rowWithGrade('전혀다른키워드', 100, '보통')];
    const result = suggestTags(rows, '유니크시드단하나', '');
    expect(result.head).toBeNull();
    expect(result.droppedOffType).toBe(0);
    expect(result.candidates).toHaveLength(1);
  });
});
