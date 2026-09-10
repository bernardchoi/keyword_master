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
  finalUrl?: string;
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

/** 단방향 토크나이저. 닫는 태그가 없는 반복 입력을 매 시작점에서 다시 탐색하지 않는다. */
function* htmlTags(html: string) {
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) return;
    let end = start + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === html.length) return;
    const raw = html.slice(start, end + 1);
    const match = /^<\/?([a-z][a-z0-9:-]*)\b/i.exec(raw);
    yield { start, end: end + 1, raw, name: match?.[1].toLowerCase() ?? '', closing: raw[1] === '/' };
    cursor = end + 1;
  }
}

function attribute(tag: string, name: string): string | null {
  const fields = /([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(fields)) {
    if (match[1].toLowerCase() === name) return decodeEntities(match[2] ?? match[3] ?? match[4]).trim();
  }
  return null;
}

function stripTags(html: string): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const tag of htmlTags(html)) { parts.push(html.slice(cursor, tag.start)); cursor = tag.end; }
  parts.push(html.slice(cursor));
  return decodeEntities(parts.join(' ')).replace(/\s+/g, ' ').trim();
}

function* elements(html: string, name: string) {
  let opening: ReturnType<typeof htmlTags> extends Generator<infer T> ? T : never;
  let inside = false;
  for (const tag of htmlTags(html)) {
    if (tag.name !== name) continue;
    if (!tag.closing && !inside) { opening = tag; inside = true; }
    else if (tag.closing && inside) {
      yield { raw: opening!.raw, text: html.slice(opening!.end, tag.start) };
      inside = false;
    }
  }
}

export function extractTitle(html: string): string | null {
  const first = elements(html, 'title').next();
  return first.done ? null : stripTags(first.value.text) || null;
}

export function extractMetaContent(html: string, name: string): string | null {
  for (const tag of htmlTags(html)) {
    if (!tag.closing && tag.name === 'meta' && attribute(tag.raw, 'name')?.toLowerCase() === name.toLowerCase()) {
      return attribute(tag.raw, 'content') || null;
    }
  }
  return null;
}

export function extractH1Texts(html: string): string[] {
  return [...elements(html, 'h1')].map((el) => stripTags(el.text)).filter(Boolean);
}

export function extractCanonical(html: string): string | null {
  for (const tag of htmlTags(html)) {
    if (!tag.closing && tag.name === 'link' && attribute(tag.raw, 'rel')?.toLowerCase().split(/\s+/).includes('canonical')) {
      return attribute(tag.raw, 'href') || null;
    }
  }
  return null;
}

export function extractJsonLd(html: string): { found: number; parsed: unknown[] } {
  let found = 0;
  const parsed: unknown[] = [];
  for (const block of elements(html, 'script')) {
    if (attribute(block.raw, 'type')?.toLowerCase() !== 'application/ld+json') continue;
    found++;
    try { parsed.push(JSON.parse(block.text)); } catch { /* 문법 오류는 found에만 반영 */ }
  }
  return { found, parsed };
}

export function extractBodyText(html: string): string {
  const first = elements(html, 'body').next();
  const body = first.done ? html : first.value.text;
  const parts: string[] = [];
  let cursor = 0;
  let hidden = '';
  for (const tag of htmlTags(body)) {
    if (!hidden) parts.push(body.slice(cursor, tag.start));
    if (!tag.closing && ['script', 'style'].includes(tag.name) && !hidden) hidden = tag.name;
    else if (tag.closing && tag.name === hidden) hidden = '';
    cursor = tag.end;
  }
  if (!hidden) parts.push(body.slice(cursor));
  return decodeEntities(parts.join(' ')).replace(/\s+/g, ' ').trim();
}

// ─── robots.txt 파싱 ────────────────────────────────────────────────────────

export interface RobotsRules {
  /** User-agent(소문자) → allow/disallow 경로 목록 */
  groups: Record<string, { allow: string[]; disallow: string[] }>;
  sitemapRefs: string[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules['groups'] = Object.create(null);
  const sitemapRefs: string[] = [];
  let current: string[] = [];
  let hasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      if (!ua) continue;
      if (hasRules) current = [];
      if (!groups[ua]) groups[ua] = { allow: [], disallow: [] };
      current.push(ua);
      hasRules = false;
      continue;
    }
    if (key === 'sitemap') {
      if (value) sitemapRefs.push(value);
      continue;
    }
    if ((key === 'allow' || key === 'disallow') && current.length > 0) {
      hasRules = true;
      for (const ua of current) groups[ua][key].push(value);
    }
  }
  return { groups, sitemapRefs };
}

/**
 * 특정 봇에 대한 허용 여부를 판단한다. 해당 봇 전용 규칙이 없으면 '*' 규칙으로 대체한다(표준 동작).
 * 규칙이 전혀 없으면 null(=암묵적 허용, 명시 정책 없음)을 돌려준다.
 */
export function robotsAllows(rules: RobotsRules, botLower: string, path = '/'): boolean | null {
  const group = rules.groups[botLower.toLowerCase()] ?? rules.groups['*'];
  if (!group) return null;
  let best = -1;
  let allowed = true;
  for (const kind of ['disallow', 'allow'] as const) {
    for (const rule of group[kind]) {
      if (!rule) continue;
      const anchored = rule.endsWith('$');
      const parts = (anchored ? rule.slice(0, -1) : rule).split('*');
      if (!path.startsWith(parts[0])) continue;
      let pos = parts[0].length;
      let matches = true;
      for (let i = 1; i < parts.length; i++) {
        const last = anchored && i === parts.length - 1;
        const at = last ? path.length - parts[i].length : path.indexOf(parts[i], pos);
        if (at < pos || (last && !path.endsWith(parts[i]))) { matches = false; break; }
        pos = at + parts[i].length;
      }
      if (anchored && pos !== path.length) matches = false;
      const specificity = parts.join('').length;
      if (matches && specificity >= best) { best = specificity; allowed = kind === 'allow'; }
    }
  }
  return allowed;
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

  if (!input.page.fetched || !input.page.text || (input.page.status !== undefined && (input.page.status < 200 || input.page.status >= 300))) {
    return [
      check(
        'fetch',
        '페이지 접근',
        'fail',
        `대상 URL을 가져오지 못했습니다 (${input.page.reason ?? `HTTP ${input.page.status ?? '알 수 없음'}`}). 아래 항목은 판정할 수 없습니다.`,
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
  if (!input.robots.fetched || !input.robots.text || input.robots.status !== 200) {
    results.push(
      check('robots', 'robots.txt', 'warn', 'robots.txt가 없습니다. 기본값은 전체 허용이지만 명시적 정책이 없습니다.'),
    );
  } else {
    const rules = parseRobots(input.robots.text);
    const target = new URL(input.pageUrl);
    const allowed = robotsAllows(rules, '*', target.pathname + target.search);
    results.push(
      allowed === false
        ? check('robots', 'robots.txt', 'fail', 'robots.txt가 진단 대상 경로의 크롤링을 차단하고 있습니다.')
        : check('robots', 'robots.txt', 'pass', 'robots.txt가 존재하고 크롤링을 차단하지 않습니다.'),
    );
  }

  // 7. sitemap.xml
  if (!input.sitemap.fetched || !input.sitemap.text || input.sitemap.status !== 200) {
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
  if (!input.robots.fetched || !input.robots.text || input.robots.status !== 200) {
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
    const target = new URL(input.pageUrl);
    const blocked = AI_BOTS.filter((b) => robotsAllows(rules, b, target.pathname + target.search) === false);

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
