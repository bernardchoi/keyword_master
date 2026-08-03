import { NextResponse } from 'next/server';
import { hasOpenApiCreds } from '@/lib/openapi';
import { CATEGORIES, inferCategories } from '@/lib/shopping-insight';
import { mapLimit } from '@/lib/metrics';
import type { CategoryCandidate } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 쇼핑인사이트는 카테고리 코드를 입력으로만 받아서, 키워드 하나의 분야를 알아내려면
 * 11개 분야를 전부 훑어야 한다 (키워드당 11회 호출). 월 5만 회 쿼터를 고려해
 * 자동 실행하지 않고 사용자가 버튼을 눌렀을 때만 돈다.
 */
const MAX_KEYWORDS = 20;

export async function POST(req: Request) {
  const started = Date.now();

  let body: { keywords?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (!hasOpenApiCreds()) {
    return NextResponse.json(
      { error: '네이버 오픈 API 키가 없어 카테고리를 분류할 수 없습니다.' },
      { status: 503 },
    );
  }

  const keywords = [...new Set((body.keywords ?? []).map((k) => k.trim()).filter(Boolean))]
    .slice(0, MAX_KEYWORDS);

  if (keywords.length === 0) {
    return NextResponse.json({ error: '분류할 키워드가 없습니다.' }, { status: 400 });
  }

  const warnings: string[] = [];

  // inferCategories 자체가 내부에서 4개씩 병렬 호출하므로
  // 여기서는 2개씩만 돌려 초당 호출 상한(50 RPS)에 여유를 둔다.
  const results = await mapLimit(keywords, 2, async (keyword) => {
    try {
      const candidates = await inferCategories(keyword, 12);
      return { keyword, categories: candidates.slice(0, 3) };
    } catch (err) {
      warnings.push(
        `${keyword}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { keyword, categories: [] as CategoryCandidate[] };
    }
  });

  return NextResponse.json({
    results,
    analyzed: keywords.length,
    calls: keywords.length * CATEGORIES.length,
    tookMs: Date.now() - started,
    warnings,
  });
}
