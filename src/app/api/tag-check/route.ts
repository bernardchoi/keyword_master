import { NextResponse } from 'next/server';
import { fetchTrend, hasOpenApiCreds } from '@/lib/openapi';
import { computeSeasonality } from '@/lib/seasonality';
import { fetchKeywordTool, hasSearchAdCreds } from '@/lib/searchad';
import { checkShoppingTag, parseTags } from '@/lib/tag-rules';
import { demoMetrics } from '@/lib/demo';
import { mapLimit } from '@/lib/metrics';
import type { Seasonality, TagCheckResult } from '@/lib/types';

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

  // 문자열로 오면 화면과 같은 파서를 쓴다 — 스마트스토어에서 복사한
  // `# 태그 ×# 태그 ×` 덩어리가 태그 1개로 잡히지 않도록.
  const raw = Array.isArray(body.tags) ? body.tags : parseTags(String(body.tags ?? ''));

  const tags = raw.map((t) => t.trim()).filter(Boolean).slice(0, MAX_TAGS);
  if (tags.length === 0) {
    return NextResponse.json({ error: '검사할 태그를 입력해 주세요.' }, { status: 400 });
  }

  const demoMode = !hasOpenApiCreds();
  const hasAd = hasSearchAdCreds();

  const results = await mapLimit<string, TagCheckResult>(tags, 4, async (tag) => {
    let monthlySearches: number | null = null;
    let seasonality: Seasonality | null = null;

    if (demoMode) {
      monthlySearches = demoMetrics(tag, 1)[0].totalSearches;
    } else {
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
      monthlySearches,
      seasonality,
      ownBrands: body.ownBrands ?? [],
    });
  });

  return NextResponse.json({
    results,
    demo: demoMode,
    disclaimer:
      '네이버는 태그 등록 가능 여부를 조회하는 공개 API 를 제공하지 않습니다. 이 결과는 스마트스토어 상품등록 정책, 월간 검색수, 3년치 추이로 계산한 시즌성을 근거로 한 추정이며, 최종 확인은 스마트스토어 상품등록 화면에서 하셔야 합니다. 등록 상품수·카테고리는 네이버가 쇼핑(상품) 검색 API 를 제공하지 않아 근거로 쓸 수 없습니다.',
  });
}
