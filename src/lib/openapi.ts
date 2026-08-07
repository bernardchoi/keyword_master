import { cached } from './cache';
import { formatYmd, isPartialMonth, monthsAgoStart, kstToday } from './date';
import { withRetry } from './ratelimit';
import type { RankHit, TrendPoint } from './types';

const TTL = Number(process.env.KM_CACHE_TTL ?? 21600) * 1000;

/**
 * 네이버는 검색·데이터랩 API 를 developers.naver.com 에서
 * NAVER API HUB(네이버 클라우드 플랫폼)로 이관했고, 구 플랫폼은 신규 등록이 막혔다.
 * 기존 키를 아직 쓰는 앱도 있으므로 두 방식을 모두 지원한다.
 *
 *  apihub  — NCP 키가 있으면 우선 사용
 *  legacy  — developers.naver.com 시절 Client ID/Secret
 */
export type Provider = 'apihub' | 'legacy';

const HOSTS: Record<Provider, string> = {
  apihub: 'https://naverapihub.apigw.ntruss.com',
  legacy: 'https://openapi.naver.com',
};

export function getProvider(): Provider | null {
  if (process.env.NCP_API_KEY_ID && process.env.NCP_API_KEY) return 'apihub';
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) return 'legacy';
  return null;
}

export function hasOpenApiCreds(): boolean {
  return getProvider() !== null;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (getProvider() === 'apihub') {
    return {
      'X-NCP-APIGW-API-KEY-ID': process.env.NCP_API_KEY_ID!,
      'X-NCP-APIGW-API-KEY': process.env.NCP_API_KEY!,
      ...extra,
    };
  }
  return {
    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
    ...extra,
  };
}

/**
 * 데이터랩 경로. 두 플랫폼의 경로 구조가 완전히 다르다.
 * (2026-08 실호출로 확인한 값)
 *   검색어트렌드  apihub: POST /search-trend/v1/search
 *                legacy: POST /v1/datalab/search
 *   쇼핑인사이트  apihub: POST /shopping/v1/<path>
 *                legacy: POST /v1/datalab/shopping/<path>
 */
function trendUrl(): string {
  return getProvider() === 'apihub'
    ? `${HOSTS.apihub}/search-trend/v1/search`
    : `${HOSTS.legacy}/v1/datalab/search`;
}

export function shoppingInsightUrl(path: string): string {
  return getProvider() === 'apihub'
    ? `${HOSTS.apihub}/shopping/v1${path}`
    : `${HOSTS.legacy}/v1/datalab/shopping${path}`;
}

export class OpenApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OpenApiError';
  }
}

/**
 * 쇼핑(상품) 검색은 목록에 없다. 네이버가 상품 검색 API 를 내려서
 * API HUB 에도, 구 developers.naver.com 키에도 없기 때문이다.
 * 그래서 이 앱은 상품수·쇼핑 경쟁도·상품 카테고리를 아예 다루지 않는다.
 * 쇼핑 쪽 신호가 필요하면 쇼핑인사이트(`lib/shopping-insight.ts`)를 쓴다.
 */
type SearchKind = 'blog' | 'cafearticle' | 'news' | 'webkr';

interface SearchResponse<T> {
  total: number;
  start: number;
  display: number;
  items: T[];
}

interface BlogItem {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
}

interface CafeItem {
  title: string;
  link: string;
  description: string;
  cafename: string;
  cafeurl: string;
}

async function search<T>(
  kind: SearchKind,
  query: string,
  params: Record<string, string | number> = {},
): Promise<SearchResponse<T>> {
  const provider = getProvider();

  const qs = new URLSearchParams({
    query,
    display: '1',
    start: '1',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

  const url =
    provider === 'apihub'
      ? `${HOSTS.apihub}/search/v1/${kind}?${qs}&format=json`
      : `${HOSTS.legacy}/v1/search/${kind}.json?${qs}`;

  const key = `open:${provider}:${kind}:${qs.toString()}`;

  return cached(key, TTL, async () => {
    // 초당 호출 한도를 넘기면 429 가 떨어지는데, 그러면 그 키워드만 문서수가 빠져
    // 표에 `–` 로 남는다. 게이트를 통과시키고 429·5xx 는 재시도한다.
    const res = await withRetry(() =>
      fetch(url, {
        headers: headers(),
        cache: 'no-store',
      }),
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint =
        res.status === 429 ? ' 잠시 후 다시 시도해 주세요 (초당 호출 한도).' : '';
      throw new OpenApiError(
        `네이버 검색 API 오류 (${kind}, ${res.status}): ${body.slice(0, 200)}${hint}`,
        res.status,
      );
    }
    return (await res.json()) as SearchResponse<T>;
  });
}

/**
 * 네이버 검색은 따옴표가 없으면 형태소 단위로 느슨하게 매칭한다.
 * 예) `유아용실내미끄럼방지양말` → 64,139건, `"유아용 실내 미끄럼방지 양말"` → 0건.
 * 경쟁강도의 분자는 "이 키워드를 실제로 노린 글 수"여야 하므로 정확일치로 센다.
 */
function exactPhrase(keyword: string): string {
  return `"${keyword.replace(/"/g, '').trim()}"`;
}

/**
 * 블로그 문서수 (경쟁강도 계산용).
 * 실패는 삼키지 않고 던진다 — 0 으로 대체하면 "경쟁 없음"처럼 보여 오해를 부른다.
 */
export async function fetchBlogTotal(keyword: string): Promise<number> {
  const res = await search<BlogItem>('blog', exactPhrase(keyword));
  return res.total;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
}

/** 이슈도 계산용. 최신순 100건을 받아 발행 밀도를 잰다. */
export async function fetchNewsItems(
  keyword: string,
): Promise<{ total: number; items: NewsItem[] }> {
  const res = await search<NewsItem>('news', exactPhrase(keyword), {
    display: 100,
    sort: 'date',
  });
  return { total: res.total ?? 0, items: res.items ?? [] };
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').trim();

/**
 * 특정 키워드 검색 결과에서 내 블로그·카페 글이 몇 번째에 있는지 찾는다.
 * ⚠️ 오픈 API 검색 결과 순서이며, 네이버 통합검색 실제 노출 순위와 다를 수 있다.
 */
export async function findRank(
  kind: 'blog' | 'cafearticle',
  keyword: string,
  target: string,
  maxScan = 300,
): Promise<{ scanned: number; hits: RankHit[] }> {
  const needle = target.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const hits: RankHit[] = [];
  let scanned = 0;

  for (let start = 1; start <= maxScan && start <= 1000; start += 100) {
    const display = Math.min(100, maxScan - scanned);
    if (display <= 0) break;

    let res: SearchResponse<BlogItem & CafeItem>;
    try {
      res = await search<BlogItem & CafeItem>(kind, keyword, { display, start });
    } catch (err) {
      // 첫 페이지부터 실패했다면 인증·쿼터 문제이므로 알려야 한다.
      // 2페이지 이후 실패는 이미 모은 결과로 답하고 멈춘다.
      if (start === 1) throw err;
      break;
    }

    const items = res.items ?? [];
    items.forEach((it, i) => {
      const rank = start + i;
      const owner = kind === 'blog' ? it.bloggername ?? '' : it.cafename ?? '';
      const haystack = `${it.link ?? ''} ${owner} ${it.bloggerlink ?? ''} ${it.cafeurl ?? ''}`
        .toLowerCase();

      if (needle && haystack.includes(needle)) {
        hits.push({
          rank,
          title: stripTags(it.title ?? ''),
          link: it.link ?? '',
          owner,
          postdate: it.postdate,
        });
      }
    });

    scanned += items.length;
    if (items.length < display) break;
  }

  return { scanned, hits };
}

/**
 * 데이터랩 검색어 트렌드 (상대 지수 0~100).
 *
 * 마지막 칸은 대개 '진행 중인 달'이라 며칠치만 집계된 값이다. 버리지 않고
 * `partial` 로 표시해 넘긴다 — 차트는 구분해서 그리고 시즌성은 이 칸을 뺀다.
 */
export async function fetchTrend(
  keyword: string,
  months = 12,
): Promise<TrendPoint[]> {
  const today = kstToday();
  const startDate = formatYmd(monthsAgoStart(months, today));
  const endDate = formatYmd(today);
  const key = `trend:${keyword}:${startDate}:${endDate}`;

  return cached(key, TTL, async () => {
    const res = await withRetry(() =>
      fetch(trendUrl(), {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          startDate,
          endDate,
          timeUnit: 'month',
          keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
        }),
        cache: 'no-store',
      }),
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new OpenApiError(
        `데이터랩 API 오류 (${res.status}): ${body.slice(0, 200)}`,
        res.status,
      );
    }

    const json = (await res.json()) as {
      results?: { data?: { period: string; ratio: number }[] }[];
    };
    return (json.results?.[0]?.data ?? []).map((d) => ({
      period: d.period,
      ratio: d.ratio,
      partial: isPartialMonth(d.period),
    }));
  });
}
