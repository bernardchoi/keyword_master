/**
 * Upstash Redis REST API 클라이언트 (Vercel KV 도 같은 REST 프로토콜을 쓴다).
 *
 * ⚠️ 왜 필요한가 — `cache.ts`의 기존 캐시는 프로세스 메모리(Map)였는데, Vercel
 * 서버리스 함수는 요청마다 다른 인스턴스가 뜰 수 있어서 인스턴스 간 캐시가
 * 공유되지 않는다. README 가 말하는 "6시간 캐시"가 콜드스타트마다 미스로
 * 새지는 구조였다. Redis 같은 외부 저장소만이 인스턴스 사이에서 실제로
 * 공유된다.
 *
 * 환경변수가 없으면 `kvEnabled = false` 가 되고, 호출부(`cache.ts`)는
 * 메모리 전용 캐시로 조용히 물러난다 — 로컬 개발에는 Redis 가 필요 없다.
 *
 * 패키지를 새로 추가하지 않는다. Upstash REST API 는 그냥 HTTP 라서
 * Node 18+/Next.js 런타임의 전역 `fetch` 로 충분하다.
 */

const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = Boolean(KV_URL && KV_TOKEN);

/**
 * Redis 커맨드 하나를 실행한다 (Upstash REST 파이프라인 형식: POST 본문에 배열 하나).
 * 값(특히 JSON 문자열)을 URL 경로에 실어 보내지 않는 이유 — 인코딩 안전성과
 * 길이 제한 때문에 path 스타일보다 body 스타일이 안전하다.
 */
async function command<T = unknown>(args: (string | number)[]): Promise<T> {
  const res = await fetch(KV_URL!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    // Redis 호출이 API 응답 전체를 물고 늘어지지 않도록 짧게 끊는다.
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`KV ${args[0]} 실패: HTTP ${res.status}`);
  const data = (await res.json()) as { result: T; error?: string };
  if (data.error) throw new Error(`KV ${args[0]} 실패: ${data.error}`);
  return data.result;
}

export async function kvGetRaw(key: string): Promise<string | null> {
  const result = await command<string | null>(['GET', key]);
  return result ?? null;
}

export async function kvSetRaw(key: string, value: string, ttlSeconds: number): Promise<void> {
  await command(['SET', key, value, 'EX', String(Math.max(1, Math.round(ttlSeconds)))]);
}
