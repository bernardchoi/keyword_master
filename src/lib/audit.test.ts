import { describe, expect, it } from 'vitest';
import {
  countSitemapLocs,
  extractBodyText,
  extractCanonical,
  extractH1Texts,
  extractJsonLd,
  extractMetaContent,
  extractTitle,
  gradeGeo,
  gradeSeo,
  parseRobots,
  robotsAllows,
  summarize,
  type AuditInput,
  type FetchOutcome,
} from './audit';

const ok = (text: string, status = 200): FetchOutcome => ({ fetched: true, status, text });
const missing = (reason = '404'): FetchOutcome => ({ fetched: false, reason });

function baseInput(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    pageUrl: 'https://example.com/',
    page: ok('<html><head><title>t</title></head><body><h1>h</h1></body></html>'),
    robots: missing(),
    sitemap: missing(),
    llms: missing(),
    notFoundStatus: 404,
    ...overrides,
  };
}

describe('HTML 파싱', () => {
  it('title을 태그 안 텍스트만 뽑는다', () => {
    expect(extractTitle('<title>키워드 마스터 | 홈</title>')).toBe('키워드 마스터 | 홈');
    expect(extractTitle('<html></html>')).toBeNull();
  });

  it('meta description을 속성 순서와 무관하게 찾는다', () => {
    expect(extractMetaContent('<meta name="description" content="설명">', 'description')).toBe('설명');
    expect(extractMetaContent('<meta content="설명2" name="description">', 'description')).toBe('설명2');
    expect(extractMetaContent('<meta name="og:title" content="x">', 'description')).toBeNull();
  });

  it('h1 여러 개를 순서대로 뽑고 빈 텍스트는 뺀다', () => {
    expect(extractH1Texts('<h1>A</h1><p>x</p><h1>  </h1><h1><span>B</span></h1>')).toEqual(['A', 'B']);
    expect(extractH1Texts('<p>no h1</p>')).toEqual([]);
  });

  it('canonical 링크를 속성 순서와 무관하게 찾는다', () => {
    expect(extractCanonical('<link rel="canonical" href="https://x.com/a">')).toBe('https://x.com/a');
    expect(extractCanonical('<link href="https://x.com/b" rel="canonical">')).toBe('https://x.com/b');
    expect(extractCanonical('<link rel="stylesheet" href="a.css">')).toBeNull();
  });

  it('JSON-LD를 파싱하고, 문법 오류 블록은 세되 결과에서 뺀다', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization"}</script>
      <script type="application/ld+json">{broken json</script>
    `;
    const r = extractJsonLd(html);
    expect(r.found).toBe(2);
    expect(r.parsed).toEqual([{ '@type': 'Organization' }]);
  });

  it('body 텍스트에서 script·style 내용은 제외한다', () => {
    const html = '<body><script>var x=1;</script><style>.a{}</style><p>진짜 본문</p></body>';
    expect(extractBodyText(html)).toBe('진짜 본문');
  });

  it('sitemap의 <loc> 개수를 센다', () => {
    expect(countSitemapLocs('<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>')).toBe(2);
    expect(countSitemapLocs('<urlset></urlset>')).toBe(0);
  });
});

describe('robots.txt 파싱', () => {
  it('user-agent 그룹별로 allow/disallow를 모은다', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /api/\nAllow: /\n\nUser-agent: GPTBot\nAllow: /');
    expect(rules.groups['*'].disallow).toEqual(['/api/']);
    expect(rules.groups['gptbot'].allow).toEqual(['/']);
  });

  it('sitemap 참조를 모은다', () => {
    const rules = parseRobots('Sitemap: https://x.com/sitemap.xml');
    expect(rules.sitemapRefs).toEqual(['https://x.com/sitemap.xml']);
  });

  it('전용 규칙이 없는 봇은 와일드카드(*)로 대체 판정한다', () => {
    const rules = parseRobots('User-agent: *\nAllow: /');
    expect(robotsAllows(rules, 'claudebot')).toBe(true);
  });

  it('규칙이 아예 없으면 null(암묵적 허용)을 돌려준다', () => {
    expect(robotsAllows(parseRobots(''), '*')).toBeNull();
  });

  it('Disallow: / 는 차단이지만, 같은 그룹에 Allow: / 가 있으면 허용으로 뒤집는다', () => {
    const blocked = parseRobots('User-agent: *\nDisallow: /');
    expect(robotsAllows(blocked, '*')).toBe(false);
    const overridden = parseRobots('User-agent: *\nDisallow: /\nAllow: /');
    expect(robotsAllows(overridden, '*')).toBe(true);
  });
});

describe('gradeSeo', () => {
  it('페이지를 못 가져오면 fetch 실패 항목 하나만 반환한다', () => {
    const results = gradeSeo(baseInput({ page: missing('timeout') }));
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fail');
  });

  it('본문이 거의 없으면(CSR) body-text가 fail이다', () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const results = gradeSeo(baseInput({ page: ok(html) }));
    const bodyCheck = results.find((r) => r.id === 'body-text');
    expect(bodyCheck?.status).toBe('fail');
  });

  it('h1·title·description·canonical·JSON-LD가 모두 있으면 해당 항목이 pass다', () => {
    const html = `<html><head>
      <title>${'가'.repeat(30)}</title>
      <meta name="description" content="${'나'.repeat(100)}">
      <link rel="canonical" href="https://example.com/">
      <script type="application/ld+json">{"@type":"WebSite"}</script>
    </head><body><h1>${'다'.repeat(300)}</h1></body></html>`;
    const results = gradeSeo(
      baseInput({ page: ok(html), robots: ok('User-agent: *\nAllow: /'), sitemap: ok('<urlset><url><loc>a</loc></url></urlset>') }),
    );
    const byId = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(byId.h1).toBe('pass');
    expect(byId.title).toBe('pass');
    expect(byId.description).toBe('pass');
    expect(byId.canonical).toBe('pass');
    expect(byId.jsonld).toBe('pass');
    expect(byId.robots).toBe('pass');
    expect(byId.sitemap).toBe('pass');
  });

  it('robots.txt가 전체 차단이면 fail이다', () => {
    const results = gradeSeo(baseInput({ robots: ok('User-agent: *\nDisallow: /') }));
    expect(results.find((r) => r.id === 'robots')?.status).toBe('fail');
  });

  it('sitemap.xml이 없으면 fail, 있지만 URL이 0개면 warn이다', () => {
    expect(gradeSeo(baseInput({ sitemap: missing() })).find((r) => r.id === 'sitemap')?.status).toBe('fail');
    expect(
      gradeSeo(baseInput({ sitemap: ok('<urlset></urlset>') })).find((r) => r.id === 'sitemap')?.status,
    ).toBe('warn');
  });

  it('없는 경로가 200을 반환하면(soft-404) fail이다', () => {
    const results = gradeSeo(baseInput({ notFoundStatus: 200 }));
    expect(results.find((r) => r.id === '404')?.status).toBe('fail');
  });
});

describe('gradeGeo', () => {
  it('llms.txt가 200이면 pass, 없으면 fail이다', () => {
    expect(gradeGeo(baseInput({ llms: ok('# x', 200) })).find((r) => r.id === 'llms')?.status).toBe('pass');
    expect(gradeGeo(baseInput({ llms: missing() })).find((r) => r.id === 'llms')?.status).toBe('fail');
  });

  it('AI 크롤러를 명시적으로 차단하면 fail이다', () => {
    const results = gradeGeo(baseInput({ robots: ok('User-agent: GPTBot\nDisallow: /') }));
    expect(results.find((r) => r.id === 'ai-crawlers')?.status).toBe('fail');
  });

  it('AI 크롤러를 명시적으로 허용하면 pass다', () => {
    const results = gradeGeo(baseInput({ robots: ok('User-agent: GPTBot\nAllow: /') }));
    expect(results.find((r) => r.id === 'ai-crawlers')?.status).toBe('pass');
  });

  it('와일드카드로만 허용되면(명시 규칙 없음) warn이다', () => {
    const results = gradeGeo(baseInput({ robots: ok('User-agent: *\nAllow: /') }));
    expect(results.find((r) => r.id === 'ai-crawlers')?.status).toBe('warn');
  });
});

describe('summarize', () => {
  it('상태별 개수를 센다', () => {
    const s = summarize([
      { id: 'a', label: 'a', status: 'pass', detail: '' },
      { id: 'b', label: 'b', status: 'pass', detail: '' },
      { id: 'c', label: 'c', status: 'warn', detail: '' },
      { id: 'd', label: 'd', status: 'fail', detail: '' },
    ]);
    expect(s).toEqual({ pass: 2, warn: 1, fail: 1 });
  });
});
