/**
 * 네이버 데이터랩·쇼핑인사이트 조회 구간을 만드는 날짜 유틸.
 *
 * 두 가지를 직접 다룬다.
 *
 * 1) **시간대** — 네이버 지표는 KST 기준인데 `new Date().toISOString()` 은 UTC 라
 *    한국 시간 09:00 이전에는 하루 전 날짜가 나온다. Vercel 처럼 UTC 로 도는
 *    서버에서는 로컬 시간에 기대는 계산도 못 쓰므로 KST 를 명시적으로 계산한다.
 *
 * 2) **`setMonth` 의 날짜 넘침** — `2026-05-31` 에서 `setMonth(-3)` 을 하면
 *    2월 31일이 없어 3월 3일로 밀린다. 조회 구간이 통째로 어긋나므로
 *    월 계산은 항상 "그 달 1일"을 기준으로 한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface Ymd {
  year: number;
  /** 1~12 */
  month: number;
  day: number;
}

/** KST 기준 오늘 */
export function kstToday(at: number = Date.now()): Ymd {
  const d = new Date(at + KST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatYmd({ year, month, day }: Ymd): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM` — 월 단위 비교용 키 */
export function monthKey({ year, month }: Pick<Ymd, 'year' | 'month'>): string {
  return `${year}-${pad(month)}`;
}

/** n개월 전 달의 1일. 날짜 넘침 없이 연·월만 더한다. */
export function monthsAgoStart(months: number, from: Ymd = kstToday()): Ymd {
  const index = from.year * 12 + (from.month - 1) - months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
}

/**
 * 조회 구간 = [n개월 전 1일, 오늘(KST)].
 * 끝을 오늘로 두면 이번 달이 '진행 중'인 채로 딸려 오는데, 그 값은
 * 버리지 않고 [isPartialMonth] 로 구분해서 쓴다 (차트에는 보여 주되 집계에서는 뺀다).
 */
export function monthRange(months: number): {
  startDate: string;
  endDate: string;
  timeUnit: 'month';
} {
  const today = kstToday();
  return {
    startDate: formatYmd(monthsAgoStart(months, today)),
    endDate: formatYmd(today),
    timeUnit: 'month',
  };
}

/**
 * 이 구간이 아직 끝나지 않은 달인가.
 *
 * 데이터랩은 `endDate` 가 월 중간이어도 그 달을 한 칸으로 돌려주는데,
 * 값은 지나간 며칠치뿐이라 다른 달과 나란히 놓을 수 없다.
 * (실측: `수영복` 2026-07 지수 47.7 → 8월 7일에 조회한 2026-08 지수 9.9)
 */
export function isPartialMonth(period: string, at: number = Date.now()): boolean {
  return period.slice(0, 7) === monthKey(kstToday(at));
}

/** 파일명 등에 쓰는 로컬 기준 오늘 (`YYYY-MM-DD`) */
export function localDateStamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
