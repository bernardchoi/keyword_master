import { kstToday } from './date';
import type { NewsPulse, Seasonality, TrendPoint } from './types';

/**
 * 월별 추이에서 시즌성을 계산한다.
 *
 * 기존 태그 검사의 시즌성 판정은 "크리스마스", "블랙프라이데이" 같은
 * 단어 목록 매칭이 전부라, `린넨원피스` 처럼 단어에 안 걸리는 계절 키워드를 놓쳤다.
 * 실제 추이로 계산하면 그런 키워드도 잡힌다.
 */
export function computeSeasonality(points: TrendPoint[]): Seasonality | null {
  // 진행 중인 달은 며칠치만 집계된 값이라 같은 달의 예년 값과 평균 낼 수 없다.
  // 그대로 두면 이번 달 지수가 눌려, 실제로는 성수기인데 '비수기'로 뒤집힌다.
  // (실측: 8월 7일에 조회한 `수영복` — 7월 47.7 → 8월 9.9)
  const complete = points.filter((p) => !p.partial);
  if (complete.length < 12) return null;

  // 같은 달끼리 묶어 평균 — 연도 간 편차를 눌러 계절 패턴만 남긴다
  const buckets = new Map<number, number[]>();
  for (const p of complete) {
    const month = Number(p.period.slice(5, 7));
    if (!month) continue;
    const arr = buckets.get(month) ?? [];
    arr.push(p.ratio);
    buckets.set(month, arr);
  }
  if (buckets.size < 12) return null;

  const monthly = [...buckets.entries()]
    .map(([month, values]) => ({
      month,
      index: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.month - b.month);

  const values = monthly.map((m) => m.index);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return null;

  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const amplitude = sd / mean; // 변동계수

  const ranked = [...monthly].sort((a, b) => b.index - a.index);
  const peakMonths = ranked.slice(0, 3).map((m) => m.month).sort((a, b) => a - b);
  const lowMonths = ranked.slice(-3).map((m) => m.month).sort((a, b) => a - b);

  // 임계값은 실데이터로 맞췄다. `수영복`(최고월/최저월 2.6배)이 0.30,
  // `무선청소기`(연중 평탄)가 0.12 로 나와 그 사이에서 갈리도록 잡았다.
  const level: Seasonality['level'] =
    amplitude >= 0.25 ? '뚜렷' : amplitude >= 0.15 ? '보통' : '없음';

  // 이번 달 판정은 '예년 같은 달' 평균으로 한다 — 진행 중인 이번 달 값은 위에서 뺐다.
  const thisMonth = kstToday().month;
  const current = monthly.find((m) => m.month === thisMonth)?.index ?? mean;
  const currentPhase: Seasonality['currentPhase'] =
    level === '없음'
      ? '보통'
      : current >= mean * 1.15
        ? '성수기'
        : current <= mean * 0.85
          ? '비수기'
          : '보통';

  // 지금부터 성수기 첫 달까지 남은 개월 수 (상품 준비 리드타임 판단용)
  const nextPeak = peakMonths
    .map((m) => (m - thisMonth + 12) % 12)
    .sort((a, b) => a - b)[0];

  return {
    monthly: monthly.map((m) => ({
      month: m.month,
      index: Math.round((m.index / Math.max(...values)) * 100),
    })),
    peakMonths,
    lowMonths,
    amplitude: Math.round(amplitude * 100) / 100,
    level,
    currentPhase,
    monthsToPeak: nextPeak,
  };
}

interface NewsItem {
  title: string;
  pubDate: string;
  link: string;
}

/**
 * 뉴스 '이슈도'.
 *
 * 최근 30일 건수로 재려 했더니 `수영복` 처럼 발행량이 큰 키워드는 받아온 100건이
 * 전부 30일 안에 들어와 변별이 되지 않았다. 그래서 건수가 아니라
 * **최신 100건이 걸쳐 있는 기간**을 본다. 기간이 짧을수록 지금 화제라는 뜻이다.
 */
export function computeNewsPulse(total: number, items: NewsItem[]): NewsPulse | null {
  const dates = items
    .map((it) => new Date(it.pubDate).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);

  if (dates.length === 0) {
    return { total, sampled: 0, spanDays: null, perDay: null, level: '조용함', latest: null };
  }

  const newest = dates[0];
  const oldest = dates[dates.length - 1];
  const spanDays = Math.max((newest - oldest) / 864e5, 0.04); // 최소 1시간
  const perDay = dates.length / spanDays;

  const level: NewsPulse['level'] =
    perDay >= 50 ? '매우 뜨거움' : perDay >= 10 ? '화제' : perDay >= 1 ? '보통' : '조용함';

  return {
    total,
    sampled: dates.length,
    spanDays: Math.round(spanDays * 10) / 10,
    perDay: Math.round(perDay * 10) / 10,
    level,
    latest: new Date(newest).toISOString().slice(0, 10),
  };
}

export const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
