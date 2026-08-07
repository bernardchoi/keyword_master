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
    demo: !searchAd,
    /** 문서수를 붙일 최대 행 수. 지정하지 않으면 표시하는 행 전부에 붙인다. */
    enrichLimit: process.env.KM_ENRICH_LIMIT ? Number(process.env.KM_ENRICH_LIMIT) : null,
  });
}
