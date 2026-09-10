import { NextResponse } from 'next/server';
import { apiBudget } from '@/lib/api-budget';
import { fetchTrend, hasOpenApiCreds } from '@/lib/openapi';
import { demoTrend } from '@/lib/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = (searchParams.get('keyword') ?? '').trim();
  if (!keyword || keyword.length > 40) {
    return NextResponse.json({ error: '키워드를 입력해 주세요.' }, { status: 400 });
  }

  const requestedMonths = Number(searchParams.get('months') ?? 12);
  if (!Number.isSafeInteger(requestedMonths)) {
    return NextResponse.json({ error: 'months는 정수여야 합니다.' }, { status: 400 });
  }
  const months = Math.min(Math.max(requestedMonths, 3), 36);
  const demoMode = !hasOpenApiCreds();
  const denied = await apiBudget(req, 1);
  if (denied) return denied;

  if (demoMode) {
    return NextResponse.json({ keyword, points: demoTrend(keyword, months), demo: true });
  }

  try {
    const points = await fetchTrend(keyword, months);
    return NextResponse.json({ keyword, points, demo: false });
  } catch (err) {
    // 차트는 부가 정보이므로 요청 자체를 실패시키지 않되, 이유는 남긴다.
    return NextResponse.json({
      keyword,
      points: [],
      demo: false,
      error: err instanceof Error ? err.message : '검색 추이를 가져오지 못했습니다.',
    });
  }
}
