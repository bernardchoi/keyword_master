import { cached } from './cache';
import type { CategoryInfo, RankHit, TrendPoint } from './types';

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

type SearchKind = 'blog' | 'cafearticle' | 'shop' | 'news' | 'webkr';

interface SearchResponse<T> {
  total: number;
  start: number;
  display: number;
  items: T[];
}

interface ShopItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  mallName: string;
  productId: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
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

  // API HUB 에는 쇼핑(상품) 검색이 없다. 0 으로 넘기면 "상품 없음"으로 오독되므로 막는다.
  if (provider === 'apihub' && kind === 'shop') {
    throw new OpenApiError(
      'NAVER API HUB 는 쇼핑(상품) 검색을 제공하지 않습니다. 쇼핑 상품수·카테고리는 조회할 수 없습니다.',
      501,
    );
  }

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
    const res = await fetch(url, {
      headers: headers(),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new OpenApiError(
        `네이버 검색 API 오류 (${kind}, ${res.status}): ${body.slice(0, 200)}`,
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

/**
 * 쇼핑 검색 상위 상품에서 카테고리 분포를 추출한다.
 * 한 번의 호출로 상품 총수(total)와 대표 카테고리를 동시에 얻는다.
 */
export async function fetchShopInsight(
  keyword: string,
  display = 100,
): Promise<{ total: number; category: CategoryInfo | null }> {
  const res = await search<ShopItem>('shop', keyword, { display, sort: 'sim' });

  const items = res.items ?? [];
  if (items.length === 0) return { total: res.total ?? 0, category: null };

  const counter = new Map<string, number>();
  for (const it of items) {
    const path = [it.category1, it.category2, it.category3, it.category4]
      .filter(Boolean)
      .join(' > ');
    if (!path) continue;
    counter.set(path, (counter.get(path) ?? 0) + 1);
  }

  const ranked = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { total: res.total ?? 0, category: null };

  const [topPath, topCount] = ranked[0];
  const prices = items
    .map((it) => Number(it.lprice))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    total: res.total ?? 0,
    category: {
      path: topPath,
      depth1: topPath.split(' > ')[0] ?? '',
      confidence: topCount / items.length,
      alternatives: ranked.slice(1, 4).map(([path, c]) => ({
        path,
        ratio: c / items.length,
      })),
      avgPrice: prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : 0,
      minPrice: prices.length ? Math.min(...prices) : 0,
    },
  };
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').trim();

/**
 * 특정 키워드 검색 결과에서 내 블로그/스토어가 몇 번째에 있는지 찾는다.
 * ⚠️ 오픈 API 검색 결과 순서이며, 네이버 통합검색 실제 노출 순위와 다를 수 있다.
 */
export async function findRank(
  kind: 'blog' | 'shop' | 'cafearticle',
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

    let res: SearchResponse<BlogItem & ShopItem & CafeItem>;
    try {
      res = await search<BlogItem & ShopItem & CafeItem>(kind, keyword, { display, start });
    } catch (err) {
      // 첫 페이지부터 실패했다면 인증·쿼터 문제이므로 알려야 한다.
      // 2페이지 이후 실패는 이미 모은 결과로 답하고 멈춘다.
      if (start === 1) throw err;
      break;
    }

    const items = res.items ?? [];
    items.forEach((it, i) => {
      const rank = start + i;
      const owner =
        kind === 'shop' ? it.mallName ?? '' : kind === 'blog' ? it.bloggername ?? '' : it.cafename ?? '';
      const haystack = `${it.link ?? ''} ${owner} ${it.bloggerlink ?? ''} ${it.cafeurl ?? ''}`
        .toLowerCase();

      if (needle && haystack.includes(needle)) {
        hits.push({
          rank,
          title: stripTags(it.title ?? ''),
          link: it.link ?? '',
          owner,
          postdate: it.postdate,
          price: it.lprice ? Number(it.lprice) : undefined,
        });
      }
    });

    scanned += items.length;
    if (items.length < display) break;
  }

  return { scanned, hits };
}

/** 데이터랩 검색어 트렌드 (상대 지수 0~100) */
export async function fetchTrend(
  keyword: string,
  months = 12,
): Promise<TrendPoint[]> {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const key = `trend:${keyword}:${fmt(start)}:${fmt(end)}`;

  return cached(key, TTL, async () => {
    const res = await fetch(trendUrl(), {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        timeUnit: 'month',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
      cache: 'no-store',
    });

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
    return (json.results?.[0]?.data ?? []) as TrendPoint[];
  });
}
