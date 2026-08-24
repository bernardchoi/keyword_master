import { describe, expect, it } from 'vitest';
import { BRAND_WORDS, withCustomBrandWords } from './brand-data';

describe('withCustomBrandWords', () => {
  it('추가 목록이 없으면 원래 BRAND_WORDS 를 그대로 돌려준다', () => {
    expect(withCustomBrandWords([])).toBe(BRAND_WORDS);
  });

  it('사용자가 보탠 단어를 앞에 붙인다', () => {
    const result = withCustomBrandWords(['나우', '샤크']);
    expect(result[0]).toBe('나우');
    expect(result[1]).toBe('샤크');
    expect(result.length).toBe(BRAND_WORDS.length + 2);
  });

  it('원본 BRAND_WORDS 배열은 건드리지 않는다', () => {
    const before = [...BRAND_WORDS];
    withCustomBrandWords(['테스트브랜드']);
    expect(BRAND_WORDS).toEqual(before);
  });
});
