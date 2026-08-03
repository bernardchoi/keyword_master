import { NextResponse } from 'next/server';
import { fetchShopInsight, fetchTrend, hasOpenApiCreds } from '@/lib/openapi';
import { computeSeasonality } from '@/lib/seasonality';
import { fetchKeywordTool, hasSearchAdCreds } from '@/lib/searchad';
import { checkShoppingTag } from '@/lib/tag-rules';
import { demoCategory, demoDocs, demoMetrics } from '@/lib/demo';
import { mapLimit } from '@/lib/metrics';
import type { CategoryInfo, Seasonality, TagCheckResult } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TAGS = 20;

export async function POST(req: Request) {
  let body: { tags?: string[] | string; ownBrands?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const raw = Array.isArray(body.tags)
    ? body.tags
    : String(body.tags ?? '').split(/[\n,]/);

  const tags = raw.map((t) => t.trim()).filter(Boolean).slice(0, MAX_TAGS);
  if (tags.length === 0) {
    return NextResponse.json({ error: '검사할 태그를 입력해 주세요.' }, { status: 400 });
  }

  const demoMode = !hasOpenApiCreds();
  const hasAd = hasSearchAdCreds();

  const errors: string[] = [];

  const results = await mapLimit<string, TagCheckResult>(tags, 4, async (tag) => {
    let shopTotal: number | null = null;
    let category: CategoryInfo | null = null;
    let monthlySearches: number | null = null;
    let seasonality: Seasonality | null = null;

    if (demoMode) {
      const m = demoMetrics(tag, 1)[0];
      monthlySearches = m.totalSearches;
      shopTotal = demoDocs(tag, m.totalSearches).shop;
      category = demoCategory(tag);
    } else {
      try {
        const insight = await fetchShopInsight(tag, 100);
        shopTotal = insight.total;
        category = insight.category;
      } catch (err) {
        // 상품수를 0 으로 두면 "검색되는 상품이 없다"는 잘못된 경고가 뜬다.
        errors.push(err instanceof Error ? err.message : String(err));
      }

      if (hasAd) {
        const metrics = await fetchKeywordTool([tag]).catch(() => []);
        const exact = metrics.find(
          (m) => m.keyword.replace(/\s+/g, '') === tag.replace(/\s+/g, ''),
        );
        monthlySearches = exact ? exact.totalSearches : null;
      }

      // 시즌성은 단어 목록이 아니라 실제 3년치 추이로 판정한다.
      const points = await fetchTrend(tag, 36).catch(() => []);
      seasonality = computeSeasonality(points);
    }

    return checkShoppingTag({
      tag,
      shopTotal,
      category,
      monthlySearches,
      seasonality,
      ownBrands: body.ownBrands ?? [],
    });
  });

  const hint = errors.some((e) => /401|403/.test(e))
    ? ' 네이버 개발자센터 > 내 애플리케이션 > API 설정에서 "검색" API를 사용 API 에 추가했는지 확인하세요.'
    : '';

  return NextResponse.json({
    results,
    demo: demoMode,
    warning: errors.length
      ? `쇼핑 데이터를 가져오지 못해 형식 규칙만 검사했습니다.${hint} 원인: ${errors[0]}`
      : undefined,
    disclaimer:
      '네이버는 태그 등록 가능 여부를 조회하는 공개 API 를 제공하지 않습니다. 이 결과는 스마트스토어 상품등록 정책과 실제 쇼핑 검색 데이터를 근거로 한 추정이며, 최종 확인은 스마트스토어 상품등록 화면에서 하셔야 합니다.',
  });
}
