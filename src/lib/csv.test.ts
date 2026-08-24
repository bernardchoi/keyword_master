import { describe, expect, it } from 'vitest';
import { parseBatchInput } from './csv';

describe('parseBatchInput', () => {
  it('키워드,상품명 형식을 한 줄씩 파싱한다', () => {
    const result = parseBatchInput('린넨원피스,여성 여름 린넨 원피스\n캠핑의자,경량 접이식 캠핑의자');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 1, keyword: '린넨원피스', name: '여성 여름 린넨 원피스', brands: [] },
      { line: 2, keyword: '캠핑의자', name: '경량 접이식 캠핑의자', brands: [] },
    ]);
  });

  it('세미콜론으로 구분한 브랜드를 3번째 칸에서 읽는다', () => {
    const result = parseBatchInput('원피스,여름 원피스,나이키;아디다스');
    expect(result.rows[0].brands).toEqual(['나이키', '아디다스']);
  });

  it('따옴표로 감싼 필드 안의 쉼표를 지킨다', () => {
    const result = parseBatchInput('원피스,"여성, 여름 원피스",');
    expect(result.rows[0].name).toBe('여성, 여름 원피스');
  });

  it('따옴표 안의 이스케이프된 큰따옴표(``)를 하나로 되돌린다', () => {
    const result = parseBatchInput('원피스,"프리미엄 ""브랜드"" 원피스",');
    expect(result.rows[0].name).toBe('프리미엄 "브랜드" 원피스');
  });

  it('빈 줄은 건너뛴다', () => {
    const result = parseBatchInput('원피스,여름 원피스\n\n\n의자,캠핑의자');
    expect(result.rows).toHaveLength(2);
  });

  it('헤더로 보이는 첫 줄(키워드/상품명 포함)은 건너뛴다', () => {
    const result = parseBatchInput('키워드,상품명,브랜드\n원피스,여름 원피스,');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].keyword).toBe('원피스');
  });

  it('키워드가 비어 있으면 줄 번호와 함께 오류를 남기고 건너뛴다', () => {
    const result = parseBatchInput(',여름 원피스');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual(['줄 1: 키워드가 비어 있습니다.']);
  });

  it('상품명이 비어 있으면 줄 번호와 함께 오류를 남기고 건너뛴다', () => {
    const result = parseBatchInput('원피스,');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual(['줄 1: 상품명이 비어 있습니다.']);
  });

  it('한 줄이 잘못돼도 나머지 줄은 정상 처리한다', () => {
    const result = parseBatchInput('원피스,여름 원피스\n,빈키워드\n의자,캠핑의자');
    expect(result.rows.map((r) => r.keyword)).toEqual(['원피스', '의자']);
    expect(result.errors).toEqual(['줄 2: 키워드가 비어 있습니다.']);
  });
});
