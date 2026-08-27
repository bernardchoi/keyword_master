/**
 * SEO·GEO 진단 — 파싱·채점만 담당하는 순수 함수 모음. 네트워크는 audit-fetch.ts가 맡고,
 * 여기는 이미 받아 온 HTML/텍스트를 판정한다(테스트가 fetch 없이 돌아가게 하기 위해서다).
 *
 * v1 범위는 SEO+GEO 자동 체크만이다. AEO·LLMO·NEO는 계정 접근·실제 AI 질의 없이는
 * 기계적으로 판정할 수 없어(fire-your-seo-agency 스킬의 진단 원칙 — "크롤러의 눈으로
 * 검증한다") 이 v1에는 넣지 않는다.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** audit-fetch.ts가 채워 주는, 이미 받아 온 응답. 실패해도 이유를 남긴다(값이 아니라 값의 실패도 근거다). */
export interface FetchOutcome {
  fetched: boolean;
  status?: number;
  text?: string;
  reason?: string;
}

export interface AuditInput {
  pageUrl: string;
  page: FetchOutcome;
  robots: FetchOutcome;
  sitemap: FetchOutcome;
  llms: FetchOutcome;
  /** 존재하지 않을 임의 경로를 찔러 본 상태 코드. fetch 자체가 실패하면 null. */
  notFoundStatus: number | null;
}

export interface AuditReport {
  targetUrl: string;
  checkedAt: string;
  seo: AuditCheck[];
  geo: AuditCheck[];
  summary: { pass: number; warn: number; fail: number };
}

// ─── HTML 파싱 헬퍼 (의존성 없이 정규식 기반 — curl|grep 진단과 같은 방식) ───────────

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#?\w+);/g, (m, code: string) => ENTITY_MAP[code] ?? m);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]) || null : null;
}

export function extractMetaContent(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameFirst = new RegExp(
    `<meta[^>]+name=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`,
    'i',
  );
  const m = html.match(nameFirst) ?? html.match(contentFirst);
  return m ? decodeEntities(m[1]).trim() || null : null;
}

export function extractH1Texts(html: string): string[] {
  const matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  return matches.map((m) => stripTags(m[1])).filter((t) => t.length > 0);
}

export function extractCanonical(html: string): string | null {
  const hrefFirst = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  const relFirst = html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const m = hrefFirst ?? relFirst;
  return m ? m[1].trim() || null : null;
}

/** JSON-LD <script> 블록을 찾아 파싱 가능한 것만 반환한다. */
export function extractJsonLd(html: string): { found: number; parsed: unknown[] } {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const parsed: unknown[] = [];
  for (const b of blocks) {
    try {
      parsed.push(JSON.parse(b[1]));
    } catch {
      // 문법 오류 — 카운트만 하고 값은 버린다
    }
  }
  return { found: blocks.length, parsed };
}

/** <body> 안에서 script/style을 뺀 실제 읽히는 텍스트 분량 — CSR/SSR 감지용. */
export function extractBodyText(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const cleaned = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return stripTags(cleaned);
}

// ─── robots.txt 파싱 ────────────────────────────────────────────────────────

export interface RobotsRules {
  /** User-agent(소문자) → allow/disallow 경로 목록 */
  groups: Record<string, { allow: string[]; disallow: string[] }>;
  sitemapRefs: string[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules['groups'] = {};
  const sitemapRefs: string[] = [];
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      if (!groups[ua]) groups[ua] = { allow: [], disallow: [] };
      current = [ua];
      continue;
    }
    if (key === 'sitemap') {
      if (value) sitemapRefs.push(value);
      continue;
    }
    if ((key === 'allow' || key === 'disallow') && current.length > 0) {
      for (const ua of current) groups[ua][key].push(value);
    }
  }
  return { groups, sitemapRefs };
}

/**
 * 특정 봇에 대한 허용 여부를 판단한다. 해당 봇 전용 규칙이 없으면 '*' 규칙으로 대체한다(표준 동작).
 * 규칙이 전혀 없으면 null(=암묵적 허용, 명시 정책 없음)을 돌려준다.
 */
export function robotsAllows(rules: RobotsRules, botLower: string): boolean | null {
  const group = rules.groups[botLower] ?? rules.groups['*'];
  if (!group) return null;
  const disallowsRoot = group.disallow.some((p) => p === '/' || p === '');
  if (disallowsRoot) {
    // Allow: / 가 더 구체적으로 덮어쓰는 흔한 패턴까지는 본다
    const allowsRoot = group.allow.some((p) => p === '/' || p === '');
    return allowsRoot;
  }
  return true;
}

export function countSitemapLocs(xml: string): number {
  return [...xml.matchAll(/<loc>/gi)].length;
}

// ─── 등급 판정 ──────────────────────────────────────────────────────────────

function check(id: string, label: string, status: CheckStatus, detail: string): AuditCheck {
  return { id, label, status, detail };
}

const AI_BOTS = ['gptbot', 'oai-searchbot', 'perplexitybot', 'claudebot'];

export function gradeSeo(input: AuditInput): AuditCheck[] {
  const results: AuditCheck[] = [];

  if (!input.page.fetched || !input.page.text) {
    return [
      check(
        'fetch',
        '페이지 접근',
        'fail',
        `대상 URL을 가져오지 못했습니다 (${input.page.reason ?? '알 수 없는 오류'}). 아래 항목은 판정할 수 없습니다.`,
      ),
    ];
  }

  const html = input.page.text;
  const bodyText = extractBodyText(html);
  const h1s = extractH1Texts(html);
  const title = extractTitle(html);
  const description = extractMetaContent(html, 'description');
  const canonical = extractCanonical(html);
  const jsonLd = extractJsonLd(html);

  // 1. 본문 텍스트 노출 (CSR/SSR 감지)
  if (bodyText.length < 100) {
    results.push(
      check(
        'body-text',
        '본문 텍스트 노출',
        'fail',
        `자바스크립트 없이 받은 본문이 ${bodyText.length}자뿐입니다 — 크롤러 눈에는 거의 빈 페이지입니다. SPA/CSR이면 SSR·SSG·프리렌더 도입이 1순위입니다.`,
      ),
    );
  } else if (bodyText.length < 400) {
    results.push(
      check(
        'body-text',
        '본문 텍스트 노출',
        'warn',
        `본문이 ${bodyText.length}자로 짧은 편입니다. 핵심 설명이 자바스크립트 없이도 보이는지 확인하세요.`,
      ),
    );
  } else {
    results.push(
      check('body-text', '본문 텍스트 노출', 'pass', `본문 ${bodyText.length}자가 자바스크립트 없이 노출됩니다.`),
    );
  }

  // 2. h1
  if (h1s.length === 0) {
    results.push(check('h1', 'h1 태그', 'fail', 'h1 태그가 없습니다. 페이지당 핵심 주제를 담은 h1이 하나 있어야 합니다.'));
  } else if (h1s.length > 1) {
    results.push(
      check('h1', 'h1 태그', 'warn', `h1이 ${h1s.length}개입니다("${h1s[0]}" 등). 페이지당 하나를 권장합니다.`),
    );
  } else {
    results.push(check('h1', 'h1 태그', 'pass', `h1: "${h1s[0]}"`));
  }

  // 3. title
  if (!title) {
    results.push(check('title', 'title 태그', 'fail', 'title 태그가 없거나 비어 있습니다.'));
  } else if (title.length < 15 || title.length > 70) {
    results.push(
      check('title', 'title 태그', 'warn', `title이 ${title.length}자입니다(권장 50~60자 내외). "${title}"`),
    );
  } else {
    results.push(check('title', 'title 태그', 'pass', `title ${title.length}자: "${title}"`));
  }

  // 4. description
  if (!description) {
    results.push(check('description', 'meta description', 'fail', 'meta description이 없습니다.'));
  } else if (description.length < 50 || description.length > 165) {
    results.push(
      check(
        'description',
        'meta description',
        'warn',
        `description이 ${description.length}자입니다(권장 150~160자 내외).`,
      ),
    );
  } else {
    results.push(check('description', 'meta description', 'pass', `description ${description.length}자`));
  }

  // 5. canonical
  results.push(
    canonical
      ? check('canonical', 'canonical 태그', 'pass', `canonical: ${canonical}`)
      : check('canonical', 'canonical 태그', 'warn', 'canonical 태그가 없습니다. 중복 URL 정리에 도움이 됩니다.'),
  );

  // 6. robots.txt
  if (!input.robots.fetched || !input.robots.text) {
    results.push(
      check('robots', 'robots.txt', 'warn', 'robots.txt가 없습니다. 기본값은 전체 허용이지만 명시적 정책이 없습니다.'),
    );
  } else {
    const rules = parseRobots(input.robots.text);
    const allowed = robotsAllows(rules, '*');
    results.push(
      allowed === false
        ? check('robots', 'robots.txt', 'fail', 'robots.txt가 전체 크롤링을 차단하고 있습니다(Disallow: /).')
        : check('robots', 'robots.txt', 'pass', 'robots.txt가 존재하고 크롤링을 차단하지 않습니다.'),
    );
  }

  // 7. sitemap.xml
  if (!input.sitemap.fetched || !input.sitemap.text) {
    results.push(check('sitemap', 'sitemap.xml', 'fail', 'sitemap.xml에 접근할 수 없습니다(404 등).'));
  } else {
    const count = countSitemapLocs(input.sitemap.text);
    results.push(
      count > 0
        ? check('sitemap', 'sitemap.xml', 'pass', `sitemap.xml에 URL ${count}개가 있습니다.`)
        : check('sitemap', 'sitemap.xml', 'warn', 'sitemap.xml은 있지만 URL 항목(<loc>)이 없습니다.'),
    );
  }

  // 8. JSON-LD
  if (jsonLd.found === 0) {
    results.push(check('jsonld', 'JSON-LD 구조화 데이터', 'fail', 'JSON-LD 구조화 데이터가 없습니다.'));
  } else if (jsonLd.parsed.length === 0) {
    results.push(
      check(
        'jsonld',
        'JSON-LD 구조화 데이터',
        'warn',
        `JSON-LD 스크립트 ${jsonLd.found}개를 찾았지만 파싱에 실패했습니다(문법 오류 가능성).`,
      ),
    );
  } else {
    results.push(
      check('jsonld', 'JSON-LD 구조화 데이터', 'pass', `유효한 JSON-LD ${jsonLd.parsed.length}건을 찾았습니다.`),
    );
  }

  // 9. 404 처리
  if (input.notFoundStatus === null) {
    results.push(check('404', '404 처리', 'warn', '존재하지 않는 경로 확인에 실패했습니다(네트워크 오류).'));
  } else if (input.notFoundStatus === 404) {
    results.push(check('404', '404 처리', 'pass', '존재하지 않는 경로가 정상적으로 404를 반환합니다.'));
  } else if (input.notFoundStatus >= 200 && input.notFoundStatus < 300) {
    results.push(
      check('404', '404 처리', 'fail', `존재하지 않는 경로가 ${input.notFoundStatus}을 반환합니다(soft-404). 색인 예산을 낭비합니다.`),
    );
  } else {
    results.push(
      check('404', '404 처리', 'warn', `존재하지 않는 경로가 ${input.notFoundStatus}을 반환합니다.`),
    );
  }

  return results;
}

export function gradeGeo(input: AuditInput): AuditCheck[] {
  const results: AuditCheck[] = [];

  // 1. llms.txt
  if (input.llms.fetched && input.llms.status === 200) {
    results.push(check('llms', 'llms.txt', 'pass', 'llms.txt가 존재합니다.'));
  } else {
    results.push(
      check('llms', 'llms.txt', 'fail', 'llms.txt가 없습니다. 생성 AI에게 사이트를 안내하는 문서를 추가하면 좋습니다.'),
    );
  }

  // 2. AI 크롤러 허용
  if (!input.robots.fetched || !input.robots.text) {
    results.push(
      check(
        'ai-crawlers',
        'AI 크롤러(GPTBot 등) 허용',
        'warn',
        'robots.txt가 없어 명시적 정책을 확인할 수 없습니다. 기본값은 허용이지만 의도적 결정은 아닙니다.',
      ),
    );
  } else {
    const rules = parseRobots(input.robots.text);
    const explicit = AI_BOTS.filter((b) => b in rules.groups);
    const blocked = AI_BOTS.filter((b) => robotsAllows(rules, b) === false);

    if (blocked.length > 0) {
      results.push(
        check(
          'ai-crawlers',
          'AI 크롤러(GPTBot 등) 허용',
          'fail',
          `${blocked.join(', ')} 크롤러가 차단되어 있습니다. 생성 AI 인용을 원한다면 Allow로 바꾸세요.`,
        ),
      );
    } else if (explicit.length > 0) {
      results.push(
        check(
          'ai-crawlers',
          'AI 크롤러(GPTBot 등) 허용',
          'pass',
          `${explicit.join(', ')} 등 ${explicit.length}개 크롤러를 명시적으로 허용하고 있습니다.`,
        ),
      );
    } else {
      results.push(
        check(
          'ai-crawlers',
          'AI 크롤러(GPTBot 등) 허용',
          'warn',
          '와일드카드(*) 규칙으로 암묵적으로만 허용됩니다. GPTBot·PerplexityBot·ClaudeBot을 명시하면 의도가 분명해집니다.',
        ),
      );
    }
  }

  return results;
}

export function summarize(checks: AuditCheck[]): AuditReport['summary'] {
  return {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
}

export function runAudit(input: AuditInput): AuditReport {
  const seo = gradeSeo(input);
  const geo = gradeGeo(input);
  return {
    targetUrl: input.pageUrl,
    checkedAt: new Date().toISOString(),
    seo,
    geo,
    summary: summarize([...seo, ...geo]),
  };
}
