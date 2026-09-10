import { NextResponse } from 'next/server';
import { readJsonBody, textField, inputErrorResponse } from '@/lib/api-input';
import { runAudit } from '@/lib/audit';
import { safeFetch, safeFetchStatus } from '@/lib/audit-fetch';
import { checkRateLimit } from '@/lib/audit-ratelimit';
import { apiBudget, clientKey } from '@/lib/api-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKey(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${Math.ceil(rl.retryAfterMs / 1000)}초 후 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  let body: { url?: string };
  try {
    body = await readJsonBody(req, { url: textField(2048) });
  } catch (error) {
    return inputErrorResponse(error);
  }

  const raw = (body.url ?? '').trim();
  if (!raw) return NextResponse.json({ error: '진단할 URL을 입력해 주세요.' }, { status: 400 });

  // 스킴이 아예 없는 입력("example.com")만 https://를 붙인다. ftp:// 같은 다른 스킴은
  // 그대로 파싱해서 아래 protocol 체크가 제대로 잡아내게 한다 — 잘못 이어붙이면
  // ("https://ftp://example.com") 엉뚱한 호스트를 문의하게 된다.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let target: URL;
  try {
    target = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: '올바른 URL 형식이 아닙니다.' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'http 또는 https 주소만 진단할 수 있습니다.' }, { status: 400 });
  }

  const denied = await apiBudget(req, 375); // 기존 8회/10분 예산을 공유 저장소에서도 적용
  if (denied) return denied;
  const page = await safeFetch(target.toString());
  if (!page.fetched) {
    return NextResponse.json({ error: `대상 URL을 가져오지 못했습니다: ${page.reason ?? '알 수 없는 오류'}` }, { status: 502 });
  }
  const finalTarget = new URL(page.finalUrl ?? target.toString());
  const origin = finalTarget.origin;
  // 무작위 슬러그라 실제 페이지와 겹칠 일이 없다 — 404 응답을 정직하게 관찰하기 위한 프로브.
  const probePath = `/__km-audit-notfound-probe-${Math.random().toString(36).slice(2)}__`;

  const [robots, sitemap, llms, notFoundStatus] = await Promise.all([
    safeFetch(`${origin}/robots.txt`),
    safeFetch(`${origin}/sitemap.xml`),
    safeFetch(`${origin}/llms.txt`),
    safeFetchStatus(`${origin}${probePath}`),
  ]);

  const report = runAudit({ pageUrl: finalTarget.toString(), page, robots, sitemap, llms, notFoundStatus });
  return NextResponse.json(report);
}
