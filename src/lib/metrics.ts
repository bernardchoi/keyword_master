import type { Competition, DocCounts, Grade, KeywordMetric } from './types';

/**
 * 경쟁강도 = 발행 문서수 ÷ 월간 검색수.
 * 1보다 작으면 "검색량이 문서수보다 많다"는 뜻이라 진입이 유리하다.
 */
const BLOG_GRADES: [number, Grade][] = [
  [0.1, '최고'],
  [0.5, '좋음'],
  [1, '보통'],
  [5, '나쁨'],
  [Infinity, '최악'],
];

const SHOP_GRADES: [number, Grade][] = [
  [0.5, '최고'],
  [2, '좋음'],
  [10, '보통'],
  [50, '나쁨'],
  [Infinity, '최악'],
];

function grade(ratio: number, table: [number, Grade][]): Grade {
  for (const [limit, g] of table) if (ratio <= limit) return g;
  return '최악';
}

export function computeCompetition(
  metric: KeywordMetric,
  docs: DocCounts,
): Competition {
  const searches = Math.max(metric.totalSearches, 1);
  const ratio = docs.blog / searches;
  const shopRatio = docs.shop === null ? null : docs.shop / searches;

  return {
    ratio,
    grade: grade(ratio, BLOG_GRADES),
    shopRatio,
    shopGrade: shopRatio === null ? null : grade(shopRatio, SHOP_GRADES),
  };
}

export const GRADE_ORDER: Grade[] = ['최고', '좋음', '보통', '나쁨', '최악'];

/** 등급을 0~100 점수로 (정렬/색상용) */
export function gradeScore(g: Grade): number {
  const idx = GRADE_ORDER.indexOf(g);
  return idx < 0 ? 0 : Math.round(((GRADE_ORDER.length - 1 - idx) / (GRADE_ORDER.length - 1)) * 100);
}

/**
 * "황금 키워드" 점수 — 검색량은 많고 경쟁은 적은 키워드를 위로 올리기 위한 종합 지표.
 * log 스케일 검색량 × 경쟁 등급 가중치.
 */
export function goldenScore(metric: KeywordMetric, comp: Competition | null): number {
  const volume = Math.log10(Math.max(metric.totalSearches, 1) + 1) / 6; // 0~1 근사
  if (!comp) return Math.round(volume * 50);
  const compFactor = 1 / (1 + comp.ratio); // ratio 0 → 1, ratio 5 → 0.17
  return Math.round(volume * compFactor * 100);
}

export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '-';
  if (ratio >= 100) return ratio.toFixed(0);
  if (ratio >= 10) return ratio.toFixed(1);
  return ratio.toFixed(2);
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 동시 실행 개수를 제한한 map. 오픈 API 초당 호출 제한 대응. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}
