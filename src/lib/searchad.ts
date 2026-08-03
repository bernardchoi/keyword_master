import crypto from 'node:crypto';
import { cached } from './cache';
import type { KeywordMetric } from './types';

const BASE = 'https://api.searchad.naver.com';

export function hasSearchAdCreds(): boolean {
  return Boolean(
    process.env.NAVER_AD_CUSTOMER_ID &&
      process.env.NAVER_AD_ACCESS_LICENSE &&
      process.env.NAVER_AD_SECRET_KEY,
  );
}

/**
 * 검색광고 API 는 HMAC-SHA256 서명을 요구한다.
 * message = `${timestamp}.${METHOD}.${path}` (쿼리스트링 제외)
 */
function buildHeaders(method: string, path: string): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', process.env.NAVER_AD_SECRET_KEY!)
    .update(`${timestamp}.${method}.${path}`)
    .digest('base64');

  return {
    'X-Timestamp': timestamp,
    'X-API-KEY': process.env.NAVER_AD_ACCESS_LICENSE!,
    'X-Customer': process.env.NAVER_AD_CUSTOMER_ID!,
    'X-Signature': signature,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

/** 검색수 필드는 값이 작으면 문자열 "< 10" 으로 내려온다. */
function parseCount(raw: unknown): { value: number; masked: boolean } {
  if (typeof raw === 'number') return { value: raw, masked: false };
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('<')) return { value: 10, masked: true };
    const n = Number(trimmed.replace(/,/g, ''));
    return { value: Number.isFinite(n) ? n : 0, masked: false };
  }
  return { value: 0, masked: false };
}

function num(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

interface RawKeyword {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  monthlyAvePcClkCnt: number | string;
  monthlyAveMobileClkCnt: number | string;
  monthlyAvePcCtr: number | string;
  monthlyAveMobileCtr: number | string;
  plAvgDepth: number | string;
  compIdx: string;
}

function toMetric(raw: RawKeyword): KeywordMetric {
  const pc = parseCount(raw.monthlyPcQcCnt);
  const mo = parseCount(raw.monthlyMobileQcCnt);
  const total = pc.value + mo.value;

  return {
    keyword: raw.relKeyword,
    pcSearches: pc.value,
    mobileSearches: mo.value,
    totalSearches: total,
    mobileShare: total > 0 ? mo.value / total : 0,
    pcClicks: num(raw.monthlyAvePcClkCnt),
    mobileClicks: num(raw.monthlyAveMobileClkCnt),
    pcCtr: num(raw.monthlyAvePcCtr),
    mobileCtr: num(raw.monthlyAveMobileCtr),
    adDepth: num(raw.plAvgDepth),
    compIdx: raw.compIdx || '-',
    masked: pc.masked || mo.masked,
  };
}

export class SearchAdError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SearchAdError';
  }
}

/**
 * 연관 키워드 + 월간 검색수 조회.
 * hintKeywords 는 최대 5개, 공백은 제거해서 보내야 한다.
 */
export async function fetchKeywordTool(hints: string[]): Promise<KeywordMetric[]> {
  const cleaned = hints
    .map((k) => k.replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 5);

  if (cleaned.length === 0) return [];

  const cacheKey = `searchad:${cleaned.join('|')}`;

  return cached(cacheKey, 6 * 3600 * 1000, async () => {
    const path = '/keywordstool';
    const qs = new URLSearchParams({
      hintKeywords: cleaned.join(','),
      showDetail: '1',
    });

    const res = await fetch(`${BASE}${path}?${qs}`, {
      method: 'GET',
      headers: buildHeaders('GET', path),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new SearchAdError(
        `검색광고 API 오류 (${res.status}): ${body.slice(0, 300)}`,
        res.status,
      );
    }

    const json = (await res.json()) as { keywordList?: RawKeyword[] };
    const list = json.keywordList ?? [];
    return list.map(toMetric).sort((a, b) => b.totalSearches - a.totalSearches);
  });
}
