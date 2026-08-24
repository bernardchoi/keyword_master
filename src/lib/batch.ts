import type { BatchInputRow } from './csv';
import { analyzeName, type NameAnalysis } from './product-name';
import { suggestTags, type TagSuggestion } from './tag-suggest';
import type { AnalyzeResponse } from './types';

/**
 * 다중 상품 일괄 처리.
 *
 * 상품명 커버리지·태그 후보 계산(`analyzeName`/`suggestTags`)은 순수
 * 함수라 서버를 거치지 않는다. 배치에서 서버가 필요한 부분은 딱
 * 하나 — 상품마다 다를 수 있는 "시드 키워드"의 연관 키워드(rows)를
 * `/api/analyze` 로 받아 오는 것뿐이다. 그래서 이 파일은 그 결과
 * (`keywordData`)를 받아서 계산만 한다. 실제 호출·동시성 제어는
 * `components/BatchOptimizer.tsx` 가 한다(순수 함수가 아니라서 여기 두지 않는다).
 *
 * 같은 키워드를 쓰는 상품이 여러 개면 그 키워드는 한 번만 조회해서
 * 나눠 쓴다 — 상품 10개가 전부 `원피스` 시드를 쓰면 API 호출은 1번이다.
 */

/** analyzeName/suggestTags 가 실제로 쓰는 부분만 받는다 — 테스트에서 AnalyzeResponse 전체를 흉내 낼 필요가 없다 */
export type KeywordData = Pick<AnalyzeResponse, 'rows' | 'keyword'>;

export interface BatchRowResult extends BatchInputRow {
  status: 'ok' | 'error';
  error?: string;
  analysis?: NameAnalysis;
  tags?: TagSuggestion;
}

export function computeBatchRow(
  row: BatchInputRow,
  keywordData: Record<string, KeywordData | { error: string }>,
  ownBrands: string[],
  blockedBrands: string[],
): BatchRowResult {
  const kd = keywordData[row.keyword];
  if (!kd) return { ...row, status: 'error', error: '이 키워드는 아직 분석되지 않았습니다.' };
  if ('error' in kd) return { ...row, status: 'error', error: kd.error };

  // 이 상품에만 적용할 브랜드(CSV 3번째 칸)는 공용 화이트리스트에 더한다.
  const brands = [...ownBrands, ...row.brands];
  const analysis = analyzeName(row.name, kd.rows, kd.keyword, brands, blockedBrands);
  const tags = suggestTags(kd.rows, kd.keyword, row.name, brands, blockedBrands);
  return { ...row, status: 'ok', analysis, tags };
}

export function computeBatchResults(
  rows: BatchInputRow[],
  keywordData: Record<string, KeywordData | { error: string }>,
  ownBrands: string[],
  blockedBrands: string[],
): BatchRowResult[] {
  return rows.map((r) => computeBatchRow(r, keywordData, ownBrands, blockedBrands));
}
