import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * kvEnabled 는 모듈 로드 시점에 process.env 를 읽어 고정되므로,
 * 환경변수 조합별로 모듈을 새로 import 해야 한다 (vi.resetModules).
 */
describe('kvEnabled', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('URL/TOKEN 이 둘 다 없으면 비활성', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { kvEnabled } = await import('./kv');
    expect(kvEnabled).toBe(false);
  });

  it('Vercel KV 이름(KV_REST_API_*)이 있으면 활성', async () => {
    process.env.KV_REST_API_URL = 'https://example.com';
    process.env.KV_REST_API_TOKEN = 'token';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { kvEnabled } = await import('./kv');
    expect(kvEnabled).toBe(true);
  });

  it('Upstash 이름(UPSTASH_REDIS_REST_*)만 있어도 활성', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const { kvEnabled } = await import('./kv');
    expect(kvEnabled).toBe(true);
  });

  it('URL만 있고 TOKEN 이 없으면 비활성', async () => {
    process.env.KV_REST_API_URL = 'https://example.com';
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { kvEnabled } = await import('./kv');
    expect(kvEnabled).toBe(false);
  });
});
