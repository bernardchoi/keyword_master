import { NextResponse } from 'next/server';
import { hasOpenApiCreds } from '@/lib/openapi';
import { fetchAllCategoryTrends } from '@/lib/shopping-insight';
import type { CategoryTrendsResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 시즌성 판정은 12개월 이상의 완결된 데이터가 필요하다(computeSeasonality). */
const MONTHS = 12;

export async function GET() {
  if (!hasOpenApiCreds()) {
    return NextResponse.json(
      { error: '네이버 오픈 API 키가 없어 분야 트렌드를 조회할 수 없습니다.' },
      { status: 503 },
    );
  }

  const { categories, warnings } = await fetchAllCategoryTrends(MONTHS);

  const payload: CategoryTrendsResponse = { categories, warnings };
  return NextResponse.json(payload);
}
