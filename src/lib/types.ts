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
  /**
   * 검색수가 `"< 10"` 으로 마스킹되어 온 경우 true.
   * 이때 PC·모바일 값은 실측치가 아니라 **상한(각 10)** 이므로
   * totalSearches 는 "이 값 미만"으로 읽어야 한다.
   */
  masked: boolean;
}

/**
 * 네이버 검색 API 로 얻은 발행 문서수.
 *
 * 블로그만 센다.
 * - 카페: 따옴표(정확일치)를 무시해서 나온 수치가 해당 키워드를 노린 글 수가 아니다.
 * - 쇼핑: 네이버가 상품 검색 API 자체를 내렸다 — API HUB 에도, 구 developers.naver.com
 *   키에도 없다. 조회할 방법이 없으므로 상품수·쇼핑 경쟁도는 다루지 않는다.
 */
export interface DocCounts {
  blog: number;
}

export interface Competition {
  /** 블로그 문서수 ÷ 월간 검색수. 낮을수록 유리 */
  ratio: number;
  grade: Grade;
  /**
   * 검색수가 마스킹된 키워드라 분모가 상한값이다.
   * 실제 경쟁강도는 이 값 **이상**이고 등급은 이보다 나쁠 수 있다.
   */
  lowerBound: boolean;
}

export interface KeywordRow extends KeywordMetric {
  docs: DocCounts | null;
  competition: Competition | null;
  /** 연관 키워드 목록에서의 순위 (검색량 기준 1위부터) */
  rank: number;
  /** 입력한 키워드 본인이면 true */
  isSeed: boolean;
}

export interface AnalyzeResponse {
  keyword: string;
  seed: KeywordRow | null;
  rows: KeywordRow[];
  /**
   * 검색광고 API 가 돌려준 연관 키워드 전체 개수.
   * rows 는 이 중 검색량 상위 일부라, 잘렸다는 사실을 화면에 밝히기 위해 함께 보낸다.
   */
  totalRelated: number;
  demo: boolean;
  enriched: number;
  tookMs: number;
  notice?: string;
}

export interface TrendPoint {
  period: string;
  ratio: number;
  /**
   * 아직 끝나지 않은 달. 지나간 며칠치만 집계된 값이라 다른 달과 비교할 수 없다.
   * 차트에는 구분해서 그리고, 시즌성 계산에서는 뺀다.
   */
  partial?: boolean;
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
    monthlySearches: number | null;
  };
}

export interface RankHit {
  rank: number;
  title: string;
  link: string;
  owner: string;
  postdate?: string;
}

export interface RankResult {
  keyword: string;
  target: string;
  source: 'blog' | 'cafe';
  scanned: number;
  hits: RankHit[];
  demo: boolean;
}

export interface CategoryTrendResult {
  code: string;
  name: string;
  /** 이 분야 자체의 최근 월별 클릭 지수(키워드 무관). 최고월=100 상댓값. */
  trend: TrendPoint[];
  /** 12개월 미만이면 null — 시즌성을 판정할 수 없다. */
  seasonality: Seasonality | null;
}

export interface CategoryTrendsResponse {
  categories: CategoryTrendResult[];
  warnings: string[];
}
