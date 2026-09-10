import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { kvConsumeBudget, kvEnabled } from './kv';

const WINDOW_MS = 10 * 60 * 1000;
const local = new Map<string, {used:number; expires:number}>();
const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
};

export function clientKey(req: Request): string {
  // Vercel은 X-Forwarded-For를 정제한다. 직접 호스팅은 신뢰 프록시를 명시한 경우만 사용.
  if (process.env.VERCEL !== '1' && process.env.KM_TRUST_PROXY !== '1') return 'shared';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
  return isIP(ip) ? createHash('sha256').update(ip).digest('hex').slice(0,32) : 'shared';
}

async function consume(key:string, cost:number, limit:number, now:number): Promise<boolean> {
  const window = Math.floor(now / WINDOW_MS);
  if (kvEnabled) return kvConsumeBudget(`km:budget:v1:${key}:${window}`, cost, limit, Math.ceil(WINDOW_MS / 1000));
  const entry = local.get(key);
  const used = entry && entry.expires > now ? entry.used : 0;
  if (used + cost > limit) return false;
  if (local.size >= 5000 && !local.has(key)) {
    for (const [k,v] of local) if (v.expires <= now) local.delete(k);
    if (local.size >= 5000) return false;
  }
  local.set(key, {used:used+cost,expires:(window+1)*WINDOW_MS});
  return true;
}

/** 로그인 없는 제품을 유지하되 외부 호출 확장량에 비례해 요청을 제한한다. */
export async function apiBudget(req: Request, estimatedCalls: number) {
  const now = Date.now();
  const retry = Math.ceil((WINDOW_MS - now % WINDOW_MS)/1000);
  const cost = Math.max(1, Math.ceil(estimatedCalls));
  try {
    const clientAllowed = await consume(`client:${clientKey(req)}`,cost,positive(process.env.KM_CLIENT_BUDGET,3000),now);
    const globalAllowed = clientAllowed && await consume('global',cost,positive(process.env.KM_GLOBAL_BUDGET,10000),now);
    if (globalAllowed) return null;
    return NextResponse.json({error:`조회 한도를 초과했습니다. ${retry}초 후 다시 시도해 주세요.`},{status:429,headers:{'Retry-After':String(retry)}});
  } catch {
    // 공유 제한기가 고장 났을 때 무제한 외부 호출로 전환하지 않는다.
    return NextResponse.json({error:'조회 한도를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'},{status:503});
  }
}
