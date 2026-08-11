import { NextResponse } from 'next/server';
import { fetchKeywordTool, hasSearchAdCreds, SearchAdError } from '@/lib/searchad';
import { fetchBlogTotal, hasOpenApiCreds } from '@/lib/openapi';
import { computeCompetition, mapLimit } from '@/lib/metrics';
import { demoDocs, demoMetrics } from '@/lib/demo';
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
  // 문서수는 표에 보이는 행 전부에 붙인다. 예전 기본값(20)에서는 나머지 행이
  // `–` 로 남았는데, 경쟁이 낮은 롱테일 키워드는 대개 그 아래쪽에 있어서
  // 정작 찾아야 할 키워드에 등급이 없었다.
  // 비용은 키워드당 검색 API 1회 — 100행이면 100회, 월 775,000회 쿼터에 여유가 있다.
  const enrichLimit = Math.min(
    Math.max(body.enrich ?? Number(process.env.KM_ENRICH_LIMIT ?? limit), 0),
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

  // ── 2. 상위 N개에 블로그 문서수 붙이기 ──────────────────────
  const targets = sliced.slice(0, enrichLimit);
  const enrichErrors: string[] = [];

  // 동시 실행 20개. 초당 호출 한도는 `lib/ratelimit.ts` 의 공용 게이트가 이미
  // 잡고 있으므로(호출 시작 간격 40ms = 25 RPS) 여기서 또 조일 필요가 없다.
  // 5로 두면 왕복 지연이 긴 환경에서 `100 ÷ 5 × 지연`이 그대로 대기 시간이 된다 —
  // 실측: Vercel 배포본에서 100행 20.0초, 같은 코드가 로컬에서는 4.8초였다.
  const enrichment = await mapLimit(targets, 20, async (m) => {
    if (demoMode || !canEnrich) return demoDocs(m.keyword, m.totalSearches) as DocCounts | null;

    try {
      return { blog: await fetchBlogTotal(m.keyword) } as DocCounts | null;
    } catch (err) {
      // 문서수를 0 으로 대체하면 "경쟁 없는 황금 키워드"처럼 보인다.
      // 값을 비우고(null) 이유를 위로 올린다.
      enrichErrors.push(err instanceof Error ? err.message : String(err));
      return null;
    }
  });

  const rows: KeywordRow[] = sliced.map((m, i) => {
    const docs = i < enrichment.length ? enrichment[i] : null;
    return {
      ...m,
      rank: i + 1,
      isSeed: m.keyword.replace(/\s+/g, '') === seedKey,
      docs,
      competition: docs ? computeCompetition(m, docs) : null,
    };
  });

  const enrichedOk = rows.filter((r) => r.docs !== null).length;

  let notice: string | undefined;
  if (demoMode) {
    notice = '데모 데이터입니다. .env.local 에 네이버 검색광고 API 키를 넣으면 실제 데이터로 바뀝니다.';
  } else if (!canEnrich) {
    notice = '네이버 오픈 API 키가 없어 문서수·경쟁강도는 데모 값입니다.';
  } else if (enrichErrors.length > 0) {
    const first = enrichErrors[0];
    const hint = /401|403/.test(first)
      ? ' NAVER API HUB 이용 신청과 키(NCP_API_KEY_ID / NCP_API_KEY)를 확인하세요.'
      : '';
    notice =
      `문서수·경쟁강도를 가져오지 못했습니다 (${enrichErrors.length}/${targets.length}건 실패).` +
      `${hint} 원인: ${first}`;
  }

  const payload: AnalyzeResponse = {
    keyword,
    seed: rows.find((r) => r.isSeed) ?? null,
    rows,
    totalRelated: metrics.length,
    demo: demoMode,
    enriched: enrichedOk,
    tookMs: Date.now() - started,
    notice,
  };

  return NextResponse.json(payload);
}
