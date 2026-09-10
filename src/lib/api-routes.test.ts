import { beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from './test-helpers';
const mocks = vi.hoisted(() => ({
  ad: vi.fn(() => true), open: vi.fn(() => true), metrics: vi.fn(), docs: vi.fn(), trend: vi.fn(),
}));
vi.mock('@/lib/searchad', () => ({ hasSearchAdCreds: mocks.ad, fetchKeywordTool: mocks.metrics, SearchAdError: class extends Error {} }));
vi.mock('@/lib/openapi', () => ({ hasOpenApiCreds: mocks.open, fetchBlogTotal: mocks.docs, fetchTrend: mocks.trend, findRank: vi.fn() }));
import { POST as analyze } from '@/app/api/analyze/route';
import { POST as rank } from '@/app/api/rank/route';
import { POST as categorize } from '@/app/api/categorize/route';
import { POST as tags } from '@/app/api/tag-check/route';
import { GET as trend } from '@/app/api/trend/route';
import { readJsonBody, inputErrorResponse, textField } from './api-input';

const req = (body: unknown) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ad.mockReturnValue(true); mocks.open.mockReturnValue(true);
  mocks.metrics.mockResolvedValue([row('인기', 1000), row('시드', 100)]);
  mocks.docs.mockResolvedValue(50); mocks.trend.mockResolvedValue([]);
});

describe('API runtime input validation', () => {
  for (const [name, handler] of Object.entries({ analyze, rank, categorize, tags })) {
    it.each([null, [], 42, 'text'])(`${name} rejects non-object JSON %j`, async (body) => {
      expect((await handler(req(body))).status).toBe(400);
      expect(mocks.metrics).not.toHaveBeenCalled();
    });
  }
  it.each([{keyword: 42}, {keyword: '시드', enrich: 'all'}, {keyword: '시드', limit: 1.5}, {keyword: 'x'.repeat(41)}])('analyze rejects %j', async (body) => {
    expect((await analyze(req(body))).status).toBe(400);
  });
  it('rejects inherited rank source and non-string list elements', async () => {
    expect((await rank(req({keyword:'시드', target:'blog', source:'toString'}))).status).toBe(400);
    expect((await categorize(req({keywords:[42]}))).status).toBe(400);
    expect((await tags(req({tags:['시드'], ownBrands:[42]}))).status).toBe(400);
  });
  it('caps actual body bytes without trusting Content-Length', async () => {
    let error: unknown;
    try { await readJsonBody(req({ignored:'x'.repeat(33000)}), {keyword:textField(40)}); }
    catch (e) { error = e; }
    expect(inputErrorResponse(error).status).toBe(413);
  });
  it('rejects invalid months before fetching', async () => {
    expect((await trend(new Request('http://localhost/api/trend?keyword=시드&months=no'))).status).toBe(400);
    expect(mocks.trend).not.toHaveBeenCalled();
  });
});

describe('analysis integrity', () => {
  it('keeps the exact seed outside the requested top rows', async () => {
    const data = await (await analyze(req({keyword:'시드',limit:1}))).json();
    expect(data.rows.map((r: {keyword:string})=>r.keyword)).toEqual(['인기']);
    expect(data.seed).toMatchObject({keyword:'시드',rank:2,docs:{blog:50},isSeed:true});
  });
  it('never fills real metrics with fake document counts', async () => {
    mocks.open.mockReturnValue(false);
    const data = await (await analyze(req({keyword:'시드'}))).json();
    expect(data.demo).toBe(false);
    expect(data.rows.every((r: {docs:unknown;competition:unknown})=>r.docs===null&&r.competition===null)).toBe(true);
    expect(mocks.docs).not.toHaveBeenCalled();
  });
  it('enrich zero makes no document requests, including for the seed', async () => {
    const data = await (await analyze(req({keyword:'시드',limit:1,enrich:0}))).json();
    expect(data.seed.docs).toBeNull();
    expect(mocks.docs).not.toHaveBeenCalled();
  });
  it('tag checks do not fabricate volume when both credentials are absent', async () => {
    mocks.ad.mockReturnValue(false); mocks.open.mockReturnValue(false);
    const data = await (await tags(req({tags:['시드']}))).json();
    expect(data.results[0].evidence.monthlySearches).toBeNull();
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
});
