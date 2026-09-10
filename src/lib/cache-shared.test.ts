import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const kv=vi.hoisted(()=>({get:vi.fn(),set:vi.fn()}));
vi.mock('./kv',()=>({kvEnabled:true,kvGetRaw:kv.get,kvSetRaw:kv.set}));
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();vi.setSystemTime(100000);kv.get.mockReset();kv.set.mockReset();});
afterEach(()=>vi.useRealTimers());
it('inherits the remaining shared TTL rather than renewing stale results',async()=>{
  const {cached}=await import('./cache');
  kv.get.mockResolvedValue(JSON.stringify({value:10,expires:101000}));
  const fn=vi.fn(async()=>20);
  expect(await cached('test',60000,fn)).toBe(10);
  expect(kv.get).toHaveBeenCalledWith('km:cache:v2:test');
  vi.setSystemTime(102000);
  expect(await cached('test',60000,fn)).toBe(20);
  expect(fn).toHaveBeenCalledOnce();
  expect(JSON.parse(kv.set.mock.calls[0][1])).toMatchObject({value:20,expires:162000});
});
