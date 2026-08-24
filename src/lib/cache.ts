import { kvEnabled, kvGetRaw, kvSetRaw } from './kv';

/**
 * 2단 TTL 캐시 — 프로세스 메모리(L1) + 선택적 Redis(L2, `kv.ts`).
 *
 * 네이버 오픈 API 는 하루 25,000 회 제한이라 같은 키워드를 반복 조회할 때
 * 쿼터를 태우지 않도록 서버 쪽에서 한 번 걸러 준다.
 *
 * ⚠️ L1(메모리)만으로는 부족하다 — Vercel 서버리스 함수는 요청마다 다른
 * 인스턴스가 뜰 수 있어 인스턴스 사이에 메모리가 공유되지 않는다. 그래서
 * "6시간 캐시"를 실제로 지키려면 인스턴스 밖에 있는 저장소가 필요하다.
 * `KV_REST_API_URL`/`KV_REST_API_TOKEN`(Vercel KV) 또는
 * `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`(Upstash) 이 설정돼
 * 있으면 자동으로 L2 로 붙는다. 없으면 L1 만으로 조용히 동작한다 —
 * 로컬 개발에는 Redis 가 필요 없다.
 */

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

const DEFAULT_TTL = Number(process.env.KM_CACHE_TTL ?? 21600) * 1000;
const MAX_ENTRIES = 5000;

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL): T {
  if (store.size >= MAX_ENTRIES) {
    // 가장 오래된 것부터 10% 정리
    const drop = Math.ceil(MAX_ENTRIES * 0.1);
    let i = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++i >= drop) break;
    }
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export interface CachedResult<T> {
  value: T;
  /** L1(메모리)·L2(Redis) 어느 쪽이든 캐시에서 읽었으면 true */
  hit: boolean;
}

/**
 * `cached()` 와 동작은 같지만 캐시 적중 여부를 함께 돌려준다.
 *
 * 화면에 "캐시된 결과입니다"를 보여 주려면(카테고리 분류처럼 호출이
 * 비싼 기능) 이 값이 필요하다. 대부분의 호출부는 값만 있으면 되므로
 * `cached()` 를 그대로 쓰고, 캐시 여부를 화면까지 보여 줘야 하는
 * 소수의 호출부만 이 함수를 쓴다.
 */
export async function cachedWithMeta<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<CachedResult<T>> {
  const memHit = cacheGet<T>(key);
  if (memHit !== undefined) return { value: memHit, hit: true };

  if (kvEnabled) {
    try {
      const raw = await kvGetRaw(key);
      if (raw !== null) {
        const value = JSON.parse(raw) as T;
        // 다음 조회는 이 인스턴스가 살아 있는 동안 왕복 없이 메모리로 바로 응답한다.
        cacheSet(key, value, ttlMs);
        return { value, hit: true };
      }
    } catch (err) {
      // Redis 가 잠깐 죽어도 앱까지 죽으면 안 된다 — 직접 계산으로 조용히 물러난다.
      console.warn('[cache] KV 읽기 실패, 직접 계산으로 진행:', err);
    }
  }

  const value = await fn();
  cacheSet(key, value, ttlMs);

  if (kvEnabled) {
    try {
      await kvSetRaw(key, JSON.stringify(value), Math.ceil(ttlMs / 1000));
    } catch (err) {
      // 메모리 캐시는 이미 채워졌으니 이번 요청 응답에는 영향 없다.
      console.warn('[cache] KV 쓰기 실패 (메모리 캐시는 정상 동작):', err);
    }
  }

  return { value, hit: false };
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  return (await cachedWithMeta(key, ttlMs, fn)).value;
}
