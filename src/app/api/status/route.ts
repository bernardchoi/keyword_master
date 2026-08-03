import { NextResponse } from 'next/server';
import { hasSearchAdCreds } from '@/lib/searchad';
import { getProvider } from '@/lib/openapi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const searchAd = hasSearchAdCreds();
  const provider = getProvider();

  return NextResponse.json({
    searchAd,
    openApi: provider !== null,
    /** 'apihub' = NAVER API HUB(NCP), 'legacy' = developers.naver.com */
    provider,
    /** 쇼핑(상품) 검색 지원 여부 — API HUB 에는 없다 */
    shopSearch: provider === 'legacy',
    demo: !searchAd,
    enrichLimit: Number(process.env.KM_ENRICH_LIMIT ?? 20),
  });
}
