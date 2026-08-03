export type Grade = '최고' | '좋음' | '보통' | '나쁨' | '최악';

/** 네이버 검색광고 keywordstool 이 돌려주는 지표 */
export interface KeywordMetric {
  keyword: string;
  /** PC 월간 검색수 */
  pcSearches: number;
  /** 모바일 월간 검색수 */
  mobileSearches: number;
  /** PC + 모바일 */
  totalSearches: number;
  /** 모바일 비중 0~1 */
  mobileShare: number;
  /** 월평균 클릭수 */
  pcClicks: number;
  mobileClicks: number;
  /** 월평균 클릭률 (%) */
  pcCtr: number;
  mobileCtr: number;
  /** 월평균 노출 광고수 */
  adDepth: number;
  /** 광고 경쟁정도: 높음 / 중간 / 낮음 */
  compIdx: string;
  /** 검색수가 "< 10" 으로 마스킹되어 온 경우 true */
  masked: boolean;
}

/**
 * 네이버 검색 API 로 얻은 발행 문서수.
 * 카페는 제외했다 — 카페 검색은 따옴표(정확일치)를 무시해서 나온 수치가
 * 해당 키워드를 노린 글 수가 아니며, 블로그 수치와 나란히 두면 오해를 부른다.
 */
export interface DocCounts {
  blog: number;
  /** 쇼핑 상품수. NAVER API HUB 에는 쇼핑 검색이 없어 null 이 될 수 있다. */
  shop: number | null;
}

export interface Competition {
  /** 블로그 문서수 ÷ 월간 검색수. 낮을수록 유리 */
  ratio: number;
  grade: Grade;
  /** 쇼핑 상품수 ÷ 월간 검색수. 쇼핑 데이터가 없으면 null */
  shopRatio: number | null;
  shopGrade: Grade | null;
}

export interface CategoryInfo {
  /** "패션의류 > 여성의류 > 원피스" */
  path: string;
  depth1: string;
  /** 상위 상품 중 이 카테고리 비율 0~1 */
  confidence: number;
  alternatives: { path: string; ratio: number }[];
  /** 상위 상품 평균/최저 가격 (원) */
  avgPrice: number;
  minPrice: number;
}

export interface KeywordRow extends KeywordMetric {
  docs: DocCounts | null;
  competition: Competition | null;
  category: CategoryInfo | null;
  /** 연관 키워드 목록에서의 순위 (검색량 기준 1위부터) */
  rank: number;
  /** 입력한 키워드 본인이면 true */
  isSeed: boolean;
}

export interface AnalyzeResponse {
  keyword: string;
  seed: KeywordRow | null;
  rows: KeywordRow[];
  /** 카테고리 path → 해당 카테고리에 속한 키워드들 */
  groups: { path: string; depth1: string; keywords: string[]; totalSearches: number }[];
  demo: boolean;
  enriched: number;
  tookMs: number;
  notice?: string;
}

export interface TrendPoint {
  period: string;
  ratio: number;
}

// ─── 쇼핑인사이트 기반 지표 ────────────────────────────────────

export interface CategoryCandidate {
  code: string;
  name: string;
  /** 데이터가 잡힌 개월 수 — 카테고리 추정의 1차 근거 */
  periods: number;
  /** 최대 개월 수 대비 비율 0~1 */
  coverage: number;
  /** 해당 카테고리 안에서의 평균 지수 (카테고리 간 비교 불가) */
  avgIndex: number;
}

/** 합이 1 이 되는 비중 */
export interface GenderSplit {
  female: number;
  male: number;
}

export interface AgeShare {
  group: string;
  share: number;
}

export interface Seasonality {
  /** 1~12월, 최고월을 100 으로 한 상대 지수 */
  monthly: { month: number; index: number }[];
  peakMonths: number[];
  lowMonths: number[];
  /** 변동계수 — 클수록 계절을 많이 탄다 */
  amplitude: number;
  level: '뚜렷' | '보통' | '없음';
  currentPhase: '성수기' | '비수기' | '보통';
  /** 다음 성수기까지 남은 개월 수 */
  monthsToPeak: number;
}

export interface NewsPulse {
  total: number;
  sampled: number;
  /** 최신 100건이 걸쳐 있는 기간(일) */
  spanDays: number | null;
  /** 하루당 발행 건수 */
  perDay: number | null;
  level: '매우 뜨거움' | '화제' | '보통' | '조용함';
  latest: string | null;
}

export interface InsightResponse {
  keyword: string;
  categories: CategoryCandidate[];
  /** 대표 카테고리 (categories[0]) */
  category: CategoryCandidate | null;
  gender: GenderSplit | null;
  ages: AgeShare[];
  seasonality: Seasonality | null;
  /** 통합검색 추이 */
  searchTrend: TrendPoint[];
  /** 네이버 쇼핑 안에서의 추이 */
  shoppingTrend: TrendPoint[];
  news: NewsPulse | null;
  warnings: string[];
}

export interface TagCheckIssue {
  level: 'block' | 'warn' | 'info';
  code: string;
  message: string;
}

export interface TagCheckResult {
  tag: string;
  normalized: string;
  verdict: '등록 가능' | '주의 필요' | '등록 불가';
  score: number;
  issues: TagCheckIssue[];
  evidence: {
    shopTotal: number | null;
    category: CategoryInfo | null;
    monthlySearches: number | null;
  };
}

export interface RankHit {
  rank: number;
  title: string;
  link: string;
  owner: string;
  postdate?: string;
  price?: number;
}

export interface RankResult {
  keyword: string;
  target: string;
  source: 'blog' | 'shop' | 'cafe';
  scanned: number;
  hits: RankHit[];
  demo: boolean;
}
