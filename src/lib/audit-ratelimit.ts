/**
 * IP당 진단 요청 속도 제한 — 각 진단이 제3자 서버로 outbound fetch를 5번 쏘기 때문에,
 * 이 엔드포인트가 스캐너·프록시로 남용되지 않도록 막는다.
 *
 * ratelimit.ts(네이버 API HUB 게이트)와 같은 한계를 그대로 진다 — 인스턴스 메모리
 * 안에서만 유효하고 여러 서버리스 인스턴스 사이에 공유되지 않는다. 이 엔드포인트는
 * 사용자 개인용 도구라 분산 리미터를 붙일 만큼 트래픽이 크지 않다고 보고 보류했다.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10분
const MAX_REQUESTS = 8;
const MAX_TRACKED_KEYS = 5000;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - recent[0]) };
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED_KEYS) {
    const drop = Math.ceil(MAX_TRACKED_KEYS * 0.1);
    let i = 0;
    for (const k of hits.keys()) {
      hits.delete(k);
      if (++i >= drop) break;
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}
