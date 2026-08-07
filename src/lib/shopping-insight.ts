import { cached } from './cache';
import { isPartialMonth, monthRange } from './date';
import { getProvider, shoppingInsightUrl } from './openapi';
import { mapLimit } from './metrics';
import { withRetry } from './ratelimit';
import type { AgeShare, CategoryCandidate, GenderSplit, TrendPoint } from './types';

const TTL = Number(process.env.KM_CACHE_TTL ?? 21600) * 1000;

/**
 * 네이버 쇼핑 1depth 카테고리 코드.
 * 쇼핑인사이트 API 는 카테고리 '코드'만 받는데, 우리가 가진 건 키워드뿐이라
 * 이 표를 훑어 어느 분야에서 클릭이 잡히는지로 카테고리를 역추정한다.
 * 코드는 네이버쇼핑에서 분야를 고를 때 URL 의 cat_id 값과 같다.
 */
export const CATEGORIES: { code: string; name: string }[] = [
  { code: '50000000', name: '패션의류' },
  { code: '50000001', name: '패션잡화' },
  { code: '50000002', name: '화장품/미용' },
  { code: '50000003', name: '디지털/가전' },
  { code: '50000004', name: '가구/인테리어' },
  { code: '50000005', name: '출산/육아' },
  { code: '50000006', name: '식품' },
  { code: '50000007', name: '스포츠/레저' },
  { code: '50000008', name: '생활/건강' },
  { code: '50000009', name: '여가/생활편의' },
  { code: '50000010', name: '면세점' },
];

interface InsightPoint {
  period: string;
  ratio: number;
  group?: string;
}

interface InsightResponse {
  results?: { title: string; keyword?: string[]; data?: InsightPoint[] }[];
}

/**
 * 카테고리 추정은 키워드 하나에 11회를 몰아 쏜다. 한도(키당 50 RPS)를 넘긴 호출이
 * 조용히 "데이터 0개월"로 취급되면 엉뚱한 카테고리가 1위가 되므로
 * (실제로 `강아지사료` 가 패션잡화로 분류됐다) 호출은 공용 게이트를 지나며,
 * 429·5xx 는 재시도한다. 게이트는 검색 API 와 공유한다 — 한도가 키 단위라
 * 키워드 분석과 카테고리 분류가 겹쳐 돌면 합계로 한도를 넘기기 때문이다.
 */
async function post(path: string, body: unknown): Promise<InsightResponse> {
  const provider = getProvider();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (provider === 'apihub') {
    headers['X-NCP-APIGW-API-KEY-ID'] = process.env.NCP_API_KEY_ID!;
    headers['X-NCP-APIGW-API-KEY'] = process.env.NCP_API_KEY!;
  } else {
    headers['X-Naver-Client-Id'] = process.env.NAVER_CLIENT_ID!;
    headers['X-Naver-Client-Secret'] = process.env.NAVER_CLIENT_SECRET!;
  }

  const res = await withRetry(() =>
    fetch(shoppingInsightUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    }),
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`쇼핑인사이트 API 오류 (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as InsightResponse;
}

/**
 * 진행 중인 달을 걷어낸다.
 * 며칠치만 집계된 값이라 '데이터가 잡힌 개월 수'로도, 비중 계산의 분모로도 쓸 수 없다.
 */
function completeMonths(data: InsightPoint[]): InsightPoint[] {
  return data.filter((d) => !isPartialMonth(d.period));
}

/**
 * 키워드가 어느 쇼핑 분야에 속하는지 역추정한다.
 *
 * ⚠️ ratio 는 "응답 하나 안에서 최댓값을 100으로 잡은 상댓값"이라
 * 카테고리끼리 지수를 비교하는 건 의미가 없다 (데이터가 한 달치뿐이어도 그 값이 100이 된다).
 * 그래서 '데이터가 잡힌 개월 수(coverage)'를 1차 기준으로 삼고,
 * 하나로 단정하지 않고 후보를 여러 개 돌려준다.
 */
export async function inferCategories(
  keyword: string,
  months = 12,
): Promise<CategoryCandidate[]> {
  const range = monthRange(months);
  const key = `cat:${keyword}:${range.startDate}`;

  return cached(key, TTL, async () => {
    const scanned = await mapLimit(CATEGORIES, 4, async ({ code, name }) => {
      try {
        const json = await post('/category/keywords', {
          ...range,
          category: code,
          keyword: [{ name: keyword, param: [keyword] }],
        });
        const data = completeMonths(json.results?.[0]?.data ?? []);
        const avg = data.length
          ? data.reduce((sum, d) => sum + d.ratio, 0) / data.length
          : 0;
        return { code, name, periods: data.length, avgIndex: avg, ok: true };
      } catch {
        // 실패를 "데이터 0개월"과 같이 취급하면 남은 분야 중 노이즈가 1위가 된다.
        return { code, name, periods: 0, avgIndex: 0, ok: false };
      }
    });

    const failed = scanned.filter((s) => !s.ok).length;
    if (failed > 2) {
      throw new Error(
        `쇼핑 분야 ${failed}/${CATEGORIES.length}곳 조회에 실패했습니다. 호출 한도를 넘었을 수 있으니 잠시 후 다시 시도하세요.`,
      );
    }

    const maxPeriods = Math.max(...scanned.map((s) => s.periods), 1);

    return scanned
      // 한두 달만 잡힌 분야는 노이즈다. 최대 개월 수의 25% 미만은 후보에서 뺀다.
      .filter((s) => s.ok && s.periods > 0 && s.periods >= maxPeriods * 0.25)
      .map((s) => ({
        ...s,
        coverage: s.periods / maxPeriods,
        avgIndex: Math.round(s.avgIndex * 10) / 10,
      }))
      // 데이터가 잡힌 개월 수 우선, 같으면 평균 지수
      .sort((a, b) => b.periods - a.periods || b.avgIndex - a.avgIndex);
  });
}

/** group 별로 ratio 합을 내어 비중(합 1)으로 환산 */
function shareByGroup(data: InsightPoint[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const d of data) {
    if (!d.group) continue;
    sums.set(d.group, (sums.get(d.group) ?? 0) + d.ratio);
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return sums;
  for (const [g, v] of sums) sums.set(g, v / total);
  return sums;
}

export async function fetchGenderSplit(
  category: string,
  keyword: string,
  months = 12,
): Promise<GenderSplit | null> {
  const range = monthRange(months);
  return cached(`gender:${category}:${keyword}:${range.startDate}`, TTL, async () => {
    const json = await post('/category/keyword/gender', { ...range, category, keyword });
    const data = completeMonths(json.results?.[0]?.data ?? []);
    if (data.length === 0) return null;
    const share = shareByGroup(data);
    return { female: share.get('f') ?? 0, male: share.get('m') ?? 0 };
  });
}

export async function fetchAgeSplit(
  category: string,
  keyword: string,
  months = 12,
): Promise<AgeShare[]> {
  const range = monthRange(months);
  return cached(`age:${category}:${keyword}:${range.startDate}`, TTL, async () => {
    const json = await post('/category/keyword/age', { ...range, category, keyword });
    const data = completeMonths(json.results?.[0]?.data ?? []);
    if (data.length === 0) return [] as AgeShare[];
    const share = shareByGroup(data);
    return [...share.entries()]
      .map(([group, value]) => ({ group: `${group}대`, share: value }))
      .sort((a, b) => Number(a.group.replace(/\D/g, '')) - Number(b.group.replace(/\D/g, '')));
  });
}

/** 네이버 쇼핑 안에서의 검색 추이 (통합검색 추이와 다르다) */
export async function fetchShoppingTrend(
  category: string,
  keyword: string,
  months = 12,
): Promise<TrendPoint[]> {
  const range = monthRange(months);
  return cached(`shoptrend:${category}:${keyword}:${range.startDate}`, TTL, async () => {
    const json = await post('/category/keywords', {
      ...range,
      category,
      keyword: [{ name: keyword, param: [keyword] }],
    });
    return (json.results?.[0]?.data ?? []).map((d) => ({
      period: d.period,
      ratio: d.ratio,
      partial: isPartialMonth(d.period),
    }));
  });
}
