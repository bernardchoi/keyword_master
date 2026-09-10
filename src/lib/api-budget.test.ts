import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const kv = vi.hoisted(()=>({enabled:false,consume:vi.fn()}));
vi.mock('./kv',()=>({get kvEnabled(){return kv.enabled;},kvConsumeBudget:kv.consume}));
beforeEach(()=>{vi.resetModules();kv.enabled=false;kv.consume.mockReset();vi.stubEnv('KM_CLIENT_BUDGET','3');vi.stubEnv('KM_GLOBAL_BUDGET','10');vi.stubEnv('VERCEL','');vi.stubEnv('KM_TRUST_PROXY','');});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe('API budgets',()=>{
  it('rejects over-budget requests and resets at the next window',async()=>{
    vi.useFakeTimers();vi.setSystemTime(600000);
    const {apiBudget}=await import('./api-budget');const req=new Request('http://localhost');
    expect(await apiBudget(req,3)).toBeNull();
    expect((await apiBudget(req,1))?.status).toBe(429);
    vi.setSystemTime(1200000);expect(await apiBudget(req,1)).toBeNull();
  });
  it('does not trust arbitrary forwarded headers on a direct server',async()=>{
    const {clientKey}=await import('./api-budget');
    expect(clientKey(new Request('http://localhost',{headers:{'x-forwarded-for':'8.8.8.8'}}))).toBe('shared');
  });
  it('uses shared atomic budgets and fails closed on Redis failure',async()=>{
    kv.enabled=true;kv.consume.mockResolvedValue(true);
    const {apiBudget}=await import('./api-budget');const req=new Request('http://localhost');
    expect(await apiBudget(req,1)).toBeNull();expect(kv.consume).toHaveBeenCalledTimes(2);
    kv.consume.mockRejectedValue(new Error('offline'));expect((await apiBudget(req,1))?.status).toBe(503);
  });
});
