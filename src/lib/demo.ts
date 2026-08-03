import type { CategoryInfo, DocCounts, KeywordMetric, RankHit, TrendPoint } from './types';

/**
 * API 키가 없을 때 앱이 그대로 돌아가도록 하는 결정적(deterministic) 가짜 데이터.
 * 같은 키워드는 항상 같은 값을 돌려주므로 UI 개발·시연에 쓸 수 있다.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const MODIFIERS = [
  '추천', '가격', '후기', '순위', '비교', '브랜드', '싼곳', '세트', '선물',
  '남자', '여자', '어린이', '대용량', '미니', '휴대용', '국내산', '수입',
  '1인용', '2인용', '온라인', '오프라인', '매장', '직구', '정품', '신상',
];

const CATEGORY_POOL: string[] = [
  '패션의류 > 여성의류 > 원피스',
  '패션잡화 > 가방 > 백팩',
  '화장품/미용 > 스킨케어 > 에센스',
  '식품 > 건강식품 > 홍삼',
  '디지털/가전 > 주방가전 > 커피머신',
  '가구/인테리어 > 침구 > 이불',
  '출산/육아 > 유아용품 > 젖병',
  '스포츠/레저 > 캠핑 > 텐트',
  '생활/건강 > 반려동물 > 사료',
];

export function demoMetrics(seed: string, count = 40): KeywordMetric[] {
  const base = hash(seed);
  const rand = rng(base);

  const make = (keyword: string, scale: number): KeywordMetric => {
    const r = rng(hash(keyword));
    const total = Math.max(10, Math.round(scale * (0.3 + r() * 1.7)));
    const mobileShare = 0.55 + r() * 0.4;
    const mobile = Math.round(total * mobileShare);
    const pc = total - mobile;
    return {
      keyword,
      pcSearches: pc,
      mobileSearches: mobile,
      totalSearches: total,
      mobileShare: total > 0 ? mobile / total : 0,
      pcClicks: Math.round(pc * (0.01 + r() * 0.05) * 10) / 10,
      mobileClicks: Math.round(mobile * (0.02 + r() * 0.08) * 10) / 10,
      pcCtr: Math.round(r() * 300) / 100,
      mobileCtr: Math.round(r() * 400) / 100,
      adDepth: Math.round(r() * 15),
      compIdx: ['낮음', '중간', '높음'][Math.floor(r() * 3)],
      masked: total <= 10,
    };
  };

  const scale = 500 + Math.floor(rand() * 60000);
  const rows: KeywordMetric[] = [make(seed.replace(/\s+/g, ''), scale)];

  const used = new Set<string>([rows[0].keyword]);
  for (let i = 0; rows.length < count && i < MODIFIERS.length * 2; i++) {
    const mod = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
    const kw = rand() > 0.5 ? `${seed}${mod}` : `${mod}${seed}`;
    const clean = kw.replace(/\s+/g, '');
    if (used.has(clean)) continue;
    used.add(clean);
    rows.push(make(clean, scale * (0.05 + rand() * 0.6)));
  }

  return rows.sort((a, b) => b.totalSearches - a.totalSearches);
}

export function demoDocs(keyword: string, searches: number): DocCounts {
  const r = rng(hash(keyword + ':docs'));
  return {
    blog: Math.round(searches * (0.05 + r() * 4)),
    shop: Math.round(searches * (0.1 + r() * 20)),
  };
}

export function demoCategory(keyword: string): CategoryInfo {
  const r = rng(hash(keyword + ':cat'));
  const path = CATEGORY_POOL[Math.floor(r() * CATEGORY_POOL.length)];
  const alt = CATEGORY_POOL.filter((p) => p !== path).slice(0, 3);
  return {
    path,
    depth1: path.split(' > ')[0],
    confidence: 0.4 + r() * 0.55,
    alternatives: alt.map((p) => ({ path: p, ratio: Math.round(r() * 25) / 100 })),
    avgPrice: Math.round((5000 + r() * 200000) / 100) * 100,
    minPrice: Math.round((1000 + r() * 20000) / 100) * 100,
  };
}

export function demoTrend(keyword: string, months = 12): TrendPoint[] {
  const r = rng(hash(keyword + ':trend'));
  const out: TrendPoint[] = [];
  const now = new Date();
  let level = 40 + r() * 40;
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    level = Math.max(5, Math.min(100, level + (r() - 0.45) * 25));
    out.push({ period: d.toISOString().slice(0, 10), ratio: Math.round(level * 10) / 10 });
  }
  return out;
}

export function demoRank(keyword: string, target: string): { scanned: number; hits: RankHit[] } {
  const r = rng(hash(keyword + target));
  const found = r() > 0.35;
  if (!found) return { scanned: 300, hits: [] };

  const hits: RankHit[] = [];
  const n = 1 + Math.floor(r() * 3);
  let rank = 1 + Math.floor(r() * 60);
  for (let i = 0; i < n; i++) {
    hits.push({
      rank,
      title: `${keyword} 관련 콘텐츠 ${i + 1} (데모)`,
      link: `https://example.com/${encodeURIComponent(target)}/${rank}`,
      owner: target,
      postdate: '20260101',
    });
    rank += 20 + Math.floor(r() * 80);
  }
  return { scanned: 300, hits };
}
