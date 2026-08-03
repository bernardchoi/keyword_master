/**
 * 아주 단순한 프로세스 메모리 TTL 캐시.
 * 네이버 오픈 API 는 하루 25,000 회 제한이라 같은 키워드를 반복 조회할 때
 * 쿼터를 태우지 않도록 서버 쪽에서 한 번 걸러 준다.
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

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  return cacheSet(key, value, ttlMs);
}
