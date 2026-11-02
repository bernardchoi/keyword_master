import { afterEach, expect, it, vi } from 'vitest';
import { fetchKeywordTool } from './searchad';

vi.mock('./cache', () => ({ cached: (_key: string, _ttl: number, load: () => unknown) => load() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('검색광고 응답의 기기별 마스킹을 구분한다', async () => {
  vi.stubEnv('NAVER_AD_SECRET_KEY', 'test-secret');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ keywordList: [
    { relKeyword: 'PC마스킹', monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: 10000 },
    { relKeyword: '모바일마스킹', monthlyPcQcCnt: 10000, monthlyMobileQcCnt: '< 10' },
    { relKeyword: '정확한10', monthlyPcQcCnt: 10, monthlyMobileQcCnt: 10000 },
  ] }))));
  const rows = await fetchKeywordTool(['테스트']);
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ keyword: 'PC마스킹', masked: true, pcMasked: true, mobileMasked: false }),
    expect.objectContaining({ keyword: '모바일마스킹', masked: true, pcMasked: false, mobileMasked: true }),
    expect.objectContaining({ keyword: '정확한10', masked: false, pcMasked: false, mobileMasked: false }),
  ]));
});
