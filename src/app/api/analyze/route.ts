import { NextResponse } from 'next/server';
import { fetchKeywordTool, hasSearchAdCreds, SearchAdError } from '@/lib/searchad';
import { fetchBlogTotal, fetchShopInsight, hasOpenApiCreds } from '@/lib/openapi';
import { computeCompetition, mapLimit } from '@/lib/metrics';
import { demoCategory, demoDocs, demoMetrics } from '@/lib/demo';
import type { AnalyzeResponse, DocCounts, KeywordMetric, KeywordRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 100;

export async function POST(req: Request) {
  const started = Date.now();

  let body: { keyword?: string; limit?: number; enrich?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const keyword = (body.keyword ?? '').trim();
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해 주세요.' }, { status: 400 });
  }
  if (keyword.length > 40) {
    return NextResponse.json({ error: '키워드가 너무 깁니다 (최대 40자).' }, { status: 400 });
  }

  const limit = Math.min(Math.max(body.limit ?? 50, 1), MAX_ROWS);
  const enrichLimit = Math.min(
    Math.max(body.enrich ?? Number(process.env.KM_ENRICH_LIMIT ?? 20), 0),
    limit,
  );

  const demoMode = !hasSearchAdCreds();
  const canEnrich = hasOpenApiCreds();

  // ── 1. 월간 검색수 + 연관 키워드 ────────────────────────────
  let metrics: KeywordMetric[];
  try {
    metrics = demoMode ? demoMetrics(keyword, limit) : await fetchKeywordTool([keyword]);
  } catch (err) {
    const message =
      err instanceof SearchAdError
        ? err.status === 401 || err.status === 403
          ? '검색광고 API 인증에 실패했습니다. NAVER_AD_* 환경변수를 확인해 주세요.'
          : err.message
        : '검색광고 API 호출에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (metrics.length === 0) {
    return NextResponse.json(
      { error: `"${keyword}" 에 대한 검색 데이터가 없습니다.` },
      { status: 404 },
    );
  }

  const sliced = metrics.slice(0, limit);
  const seedKey = keyword.replace(/\s+/g, '');

  // ── 2. 상위 N개에 문서수 / 카테고리 붙이기 ──────────────────
  const targets = sliced.slice(0, enrichLimit);
  const enrichErrors: string[] = [];
  let shopUnavailable: string | null = null;

  const enrichment = await mapLimit(targets, 5, async (m) => {
    if (demoMode || !canEnrich) {
      const docs = demoDocs(m.keyword, m.totalSearches);
      return { docs: docs as DocCounts | null, category: demoCategory(m.keyword) };
    }
    // 블로그·카페·쇼핑을 따로 판정한다. API HUB 에는 쇼핑 검색이 없으므로
    // 쇼핑이 실패해도 경쟁강도(블로그 기준)는 살려야 한다.
    const [blogRes, shopRes] = await Promise.allSettled([
      fetchBlogTotal(m.keyword),
      fetchShopInsight(m.keyword, 100),
    ]);

    if (blogRes.status === 'rejected') {
      // 문서수를 0 으로 대체하면 "경쟁 없는 황금 키워드"처럼 보인다.
      // 값을 비우고(null) 이유를 위로 올린다.
      enrichErrors.push(
        blogRes.reason instanceof Error ? blogRes.reason.message : String(blogRes.reason),
      );
      return { docs: null as DocCounts | null, category: null };
    }

    if (shopRes.status === 'rejected') {
      shopUnavailable =
        shopRes.reason instanceof Error ? shopRes.reason.message : String(shopRes.reason);
    }

    const shop = shopRes.status === 'fulfilled' ? shopRes.value : null;
    return {
      docs: { blog: blogRes.value, shop: shop?.total ?? null } as DocCounts | null,
      category: shop?.category ?? null,
    };
  });

  const rows: KeywordRow[] = sliced.map((m, i) => {
    const extra = i < enrichment.length ? enrichment[i] : null;
    return {
      ...m,
      rank: i + 1,
      isSeed: m.keyword.replace(/\s+/g, '') === seedKey,
      docs: extra?.docs ?? null,
      competition: extra?.docs ? computeCompetition(m, extra.docs) : null,
      category: extra?.category ?? null,
    };
  });

  // ── 3. 카테고리별로 키워드 묶기 ─────────────────────────────
  const groupMap = new Map<string, { depth1: string; keywords: string[]; totalSearches: number }>();
  for (const row of rows) {
    if (!row.category) continue;
    const g = groupMap.get(row.category.path) ?? {
      depth1: row.category.depth1,
      keywords: [],
      totalSearches: 0,
    };
    g.keywords.push(row.keyword);
    g.totalSearches += row.totalSearches;
    groupMap.set(row.category.path, g);
  }

  const groups = [...groupMap.entries()]
    .map(([path, g]) => ({ path, ...g }))
    .sort((a, b) => b.totalSearches - a.totalSearches);

  const enrichedOk = rows.filter((r) => r.docs !== null).length;

  let notice: string | undefined;
  if (demoMode) {
    notice = '데모 데이터입니다. .env.local 에 네이버 검색광고 API 키를 넣으면 실제 데이터로 바뀝니다.';
  } else if (!canEnrich) {
    notice = '네이버 오픈 API 키가 없어 문서수·카테고리는 데모 값입니다.';
  } else if (enrichErrors.length > 0) {
    const first = enrichErrors[0];
    const hint = /401|403/.test(first)
      ? ' NAVER API HUB 이용 신청과 키(NCP_API_KEY_ID / NCP_API_KEY)를 확인하세요.'
      : '';
    notice =
      `문서수·경쟁강도·카테고리를 가져오지 못했습니다 (${enrichErrors.length}/${targets.length}건 실패).` +
      `${hint} 원인: ${first}`;
  } else if (shopUnavailable) {
    notice = `쇼핑 상품수·카테고리는 표시할 수 없습니다. ${shopUnavailable}`;
  }

  const payload: AnalyzeResponse = {
    keyword,
    seed: rows.find((r) => r.isSeed) ?? null,
    rows,
    groups,
    demo: demoMode,
    enriched: enrichedOk,
    tookMs: Date.now() - started,
    notice,
  };

  return NextResponse.json(payload);
}
