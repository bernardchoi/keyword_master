import { NextResponse } from 'next/server';
import { fetchNewsItems, fetchTrend, hasOpenApiCreds } from '@/lib/openapi';
import {
  fetchAgeSplit,
  fetchGenderSplit,
  fetchShoppingTrend,
  inferCategories,
} from '@/lib/shopping-insight';
import { computeNewsPulse, computeSeasonality } from '@/lib/seasonality';
import type { InsightResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 시즌성은 연도 간 편차를 눌러야 해서 3년치를 본다. */
const SEASON_MONTHS = 36;
const DETAIL_MONTHS = 12;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = (searchParams.get('keyword') ?? '').trim();
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해 주세요.' }, { status: 400 });
  }

  if (!hasOpenApiCreds()) {
    return NextResponse.json(
      { error: '네이버 오픈 API 키가 없어 인사이트를 조회할 수 없습니다.' },
      { status: 503 },
    );
  }

  const warnings: string[] = [];
  const note = (label: string, err: unknown) => {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  };

  // 카테고리 추정과 통합검색 추이·뉴스는 서로 독립이므로 함께 시작한다.
  const [catRes, seasonRes, newsRes] = await Promise.allSettled([
    inferCategories(keyword, DETAIL_MONTHS),
    fetchTrend(keyword, SEASON_MONTHS),
    fetchNewsItems(keyword),
  ]);

  const categories = catRes.status === 'fulfilled' ? catRes.value.candidates : [];
  if (catRes.status === 'rejected') note('카테고리 추정', catRes.reason);

  const searchTrend = seasonRes.status === 'fulfilled' ? seasonRes.value : [];
  if (seasonRes.status === 'rejected') note('검색 추이', seasonRes.reason);

  let news = null;
  if (newsRes.status === 'fulfilled') {
    news = computeNewsPulse(newsRes.value.total, newsRes.value.items);
  } else {
    note('뉴스 이슈도', newsRes.reason);
  }

  // 성별·연령·쇼핑추이는 카테고리 코드가 있어야 조회된다.
  const category = categories[0] ?? null;
  let gender = null;
  let ages: InsightResponse['ages'] = [];
  let shoppingTrend: InsightResponse['shoppingTrend'] = [];

  if (category) {
    const [g, a, s] = await Promise.allSettled([
      fetchGenderSplit(category.code, keyword, DETAIL_MONTHS),
      fetchAgeSplit(category.code, keyword, DETAIL_MONTHS),
      fetchShoppingTrend(category.code, keyword, DETAIL_MONTHS),
    ]);
    if (g.status === 'fulfilled') gender = g.value;
    else note('성별 분포', g.reason);
    if (a.status === 'fulfilled') ages = a.value;
    else note('연령 분포', a.reason);
    if (s.status === 'fulfilled') shoppingTrend = s.value;
    else note('쇼핑 추이', s.reason);
  } else if (catRes.status === 'fulfilled') {
    warnings.push(
      '네이버 쇼핑에서 이 키워드의 클릭 데이터가 잡히지 않아 구매층·쇼핑 추이를 조회할 수 없습니다. 쇼핑성 키워드가 아닐 수 있습니다.',
    );
  }

  const payload: InsightResponse = {
    keyword,
    categories,
    category,
    gender,
    ages,
    seasonality: computeSeasonality(searchTrend),
    searchTrend,
    shoppingTrend,
    news,
    warnings,
  };

  return NextResponse.json(payload);
}
