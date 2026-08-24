import { describe, expect, it } from 'vitest';
import { computeBatchResults, computeBatchRow, type KeywordData } from './batch';
import type { BatchInputRow } from './csv';
import { row } from './test-helpers';

const dressRows = [
  row('린넨원피스', 5000),
  row('여름원피스', 3000),
  row('나이키원피스', 1500),
];

const chairRows = [row('캠핑의자', 4000), row('접이식캠핑의자', 2000)];

const keywordData: Record<string, KeywordData | { error: string }> = {
  린넨원피스: { keyword: '린넨원피스', rows: dressRows },
  캠핑의자: { keyword: '캠핑의자', rows: chairRows },
  실패키워드: { error: 'API 오류 (500)' },
};

describe('computeBatchRow', () => {
  it('키워드 데이터가 있으면 커버리지·태그 후보를 계산한다', () => {
    const input: BatchInputRow = { line: 1, keyword: '린넨원피스', name: '린넨 원피스', brands: [] };
    const result = computeBatchRow(input, keywordData, [], []);
    expect(result.status).toBe('ok');
    expect(result.analysis?.coveredVolume).toBe(5000);
    expect(result.tags?.candidates.length).toBeGreaterThan(0);
  });

  it('아직 분석되지 않은 키워드는 오류로 표시된다', () => {
    const input: BatchInputRow = { line: 1, keyword: '없는키워드', name: '상품', brands: [] };
    const result = computeBatchRow(input, keywordData, [], []);
    expect(result.status).toBe('error');
    expect(result.error).toContain('아직 분석되지');
  });

  it('/api/analyze 호출이 실패한 키워드는 그 오류 메시지를 그대로 옮긴다', () => {
    const input: BatchInputRow = { line: 1, keyword: '실패키워드', name: '상품', brands: [] };
    const result = computeBatchRow(input, keywordData, [], []);
    expect(result.status).toBe('error');
    expect(result.error).toBe('API 오류 (500)');
  });

  it('행별 브랜드(3번째 칸)가 공용 브랜드 목록에 더해진다', () => {
    const input: BatchInputRow = {
      line: 1,
      keyword: '린넨원피스',
      name: '나이키 원피스',
      brands: ['나이키'],
    };
    const withRowBrand = computeBatchRow(input, keywordData, [], []);
    expect(withRowBrand.analysis?.issues.some((i) => i.code === 'BRAND')).toBe(false);

    const withoutRowBrand = computeBatchRow({ ...input, brands: [] }, keywordData, [], []);
    expect(withoutRowBrand.analysis?.issues.some((i) => i.code === 'BRAND')).toBe(true);
  });
});

describe('computeBatchResults', () => {
  it('여러 행을 한 번에 계산하고 순서를 보존한다', () => {
    const rows: BatchInputRow[] = [
      { line: 1, keyword: '린넨원피스', name: '린넨 원피스', brands: [] },
      { line: 2, keyword: '캠핑의자', name: '캠핑 의자', brands: [] },
      { line: 3, keyword: '없는키워드', name: '상품', brands: [] },
    ];
    const results = computeBatchResults(rows, keywordData, [], []);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'error']);
    expect(results.map((r) => r.keyword)).toEqual(['린넨원피스', '캠핑의자', '없는키워드']);
  });
});
