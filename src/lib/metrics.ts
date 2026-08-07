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

function grade(ratio: number, table: [number, Grade][]): Grade {
  for (const [limit, g] of table) if (ratio <= limit) return g;
  return '최악';
}

/**
 * 분모(월간 검색수)가 마스킹된 상한값이면 나온 경쟁강도는 **하한**이다.
 * 예를 들어 검색수가 `< 10` 인데 문서가 500건이면 실제 경쟁강도는 50 이 아니라 50 이상이고,
 * 등급도 표시된 것보다 나쁠 수 있다. 이 사실을 값에 실어 보내 화면에서 `≥` 로 밝힌다.
 */
export function computeCompetition(
  metric: KeywordMetric,
  docs: DocCounts,
): Competition {
  const searches = Math.max(metric.totalSearches, 1);
  const ratio = docs.blog / searches;

  return {
    ratio,
    grade: grade(ratio, BLOG_GRADES),
    lowerBound: metric.masked,
  };
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
