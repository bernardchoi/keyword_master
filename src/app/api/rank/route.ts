import { NextResponse } from 'next/server';
import { findRank, hasOpenApiCreds } from '@/lib/openapi';
import { demoRank } from '@/lib/demo';
import type { RankResult } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 쇼핑은 없다 — 네이버가 상품 검색 API 를 제공하지 않는다. */
const KINDS = { blog: 'blog', cafe: 'cafearticle' } as const;

export async function POST(req: Request) {
  let body: { keyword?: string; target?: string; source?: keyof typeof KINDS; depth?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const keyword = (body.keyword ?? '').trim();
  const target = (body.target ?? '').trim();
  const source = body.source && body.source in KINDS ? body.source : 'blog';
  const depth = Math.min(Math.max(body.depth ?? 300, 100), 1000);

  if (!keyword) return NextResponse.json({ error: '키워드를 입력해 주세요.' }, { status: 400 });
  if (!target) {
    return NextResponse.json(
      { error: '찾을 대상(블로그 ID, 카페명, 도메인)을 입력해 주세요.' },
      { status: 400 },
    );
  }

  const demoMode = !hasOpenApiCreds();

  let scanned: number;
  let hits: RankResult['hits'];
  try {
    ({ scanned, hits } = demoMode
      ? demoRank(keyword, target)
      : await findRank(KINDS[source], keyword, target, depth));
  } catch (err) {
    const message = err instanceof Error ? err.message : '순위 조회에 실패했습니다.';
    const hint = /401|403/.test(message)
      ? ' 네이버 개발자센터 > 내 애플리케이션 > API 설정에서 "검색" API를 사용 API 에 추가했는지 확인하세요.'
      : '';
    return NextResponse.json({ error: message + hint }, { status: 502 });
  }

  const payload: RankResult = { keyword, target, source, scanned, hits, demo: demoMode };
  return NextResponse.json({
    ...payload,
    disclaimer:
      '네이버 검색 오픈 API 결과 순서 기준입니다. 통합검색 화면의 실제 노출 순위(VIEW/스마트블록 등)와 다를 수 있습니다.',
  });
}
