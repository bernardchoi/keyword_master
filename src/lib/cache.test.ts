import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * KV_REST_API_URL/TOKEN 이 테스트 환경에는 없으므로 kvEnabled=false 로
 * 로드된다 — 여기서는 메모리(L1) 전용 경로만 검증한다. Redis(L2) 경로는
 * kv.test.ts 에서 kvEnabled 플래그를, cache.ts 안의 try/catch 는 로직상
 * kv.ts 호출을 그대로 감싸는 것뿐이라 별도 목킹 없이도 이 파일의 커버리지로
 * 충분하다.
 */
describe('cached / cachedWithMeta (메모리 전용 경로)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('처음 호출하면 fn 을 실행하고 결과를 캐시한다', async () => {
    const { cached } = await import('./cache');
    const fn = vi.fn().mockResolvedValue('value-1');
    const result = await cached('key-a', 60_000, fn);
    expect(result).toBe('value-1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('같은 키로 다시 호출하면 fn 을 다시 실행하지 않는다', async () => {
    const { cached } = await import('./cache');
    const fn = vi.fn().mockResolvedValue('value-1');
    await cached('key-b', 60_000, fn);
    const second = await cached('key-b', 60_000, fn);
    expect(second).toBe('value-1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cachedWithMeta 는 처음엔 hit=false, 두 번째는 hit=true', async () => {
    const { cachedWithMeta } = await import('./cache');
    const fn = vi.fn().mockResolvedValue(42);
    const first = await cachedWithMeta('key-c', 60_000, fn);
    expect(first).toEqual({ value: 42, hit: false });

    const second = await cachedWithMeta('key-c', 60_000, fn);
    expect(second).toEqual({ value: 42, hit: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('키가 다르면 서로 영향을 주지 않는다', async () => {
    const { cached } = await import('./cache');
    const fnA = vi.fn().mockResolvedValue('a');
    const fnB = vi.fn().mockResolvedValue('b');
    expect(await cached('key-d1', 60_000, fnA)).toBe('a');
    expect(await cached('key-d2', 60_000, fnB)).toBe('b');
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('TTL 이 지나면 다시 계산한다', async () => {
    vi.useFakeTimers();
    try {
      const { cached } = await import('./cache');
      const fn = vi.fn().mockResolvedValue('fresh');
      await cached('key-e', 1000, fn);
      vi.advanceTimersByTime(1001);
      await cached('key-e', 1000, fn);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cacheSet/cacheGet 은 직접 읽고 쓸 수 있다', async () => {
    const { cacheGet, cacheSet } = await import('./cache');
    cacheSet('key-f', { n: 1 }, 60_000);
    expect(cacheGet('key-f')).toEqual({ n: 1 });
  });

  it('cacheGet 은 없는 키에 undefined 를 돌려준다', async () => {
    const { cacheGet } = await import('./cache');
    expect(cacheGet('key-does-not-exist')).toBeUndefined();
  });
});
