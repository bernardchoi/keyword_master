import type { AnalyzeResponse, Grade } from './types';

/**
 * 분석 이력 스냅샷.
 *
 * 키워드 하나를 조회할 때마다(성공한 경우만) 핵심 지표를 남겨 두면,
 * 다음에 같은 키워드를 조회했을 때 "지난번 대비 뭐가 바뀌었는지"를
 * 계산할 수 있다. 표 전체가 아니라 시드 키워드의 지표만 남긴다 —
 * 연관 키워드 100개를 매번 통째로 저장하면 localStorage 가 금방 찬다.
 */
export interface HistorySnapshot {
  /** 저장 시각 (ms) */
  at: number;
  totalSearches: number;
  pcSearches: number;
  mobileSearches: number;
  /** 검색수가 `< 10` 으로 마스킹된 조회였는가 — 마스킹 여부가 바뀌면 비교가 의미 없다 */
  masked: boolean;
  grade: Grade | null;
  ratio: number | null;
  /** 경쟁강도가 하한(마스킹된 검색수 기준)이었는가 */
  lowerBound: boolean;
  rowCount: number;
  totalRelated: number;
}

/** AnalyzeResponse 에서 스냅샷을 뽑는다. 시드 조회에 실패했으면(seed=null) 저장할 게 없다. */
export function snapshotFromAnalysis(
  res: Pick<AnalyzeResponse, 'seed' | 'rows' | 'totalRelated'>,
  at: number = Date.now(),
): HistorySnapshot | null {
  if (!res.seed) return null;
  const { seed } = res;
  return {
    at,
    totalSearches: seed.totalSearches,
    pcSearches: seed.pcSearches,
    mobileSearches: seed.mobileSearches,
    masked: seed.masked,
    grade: seed.competition?.grade ?? null,
    ratio: seed.competition?.ratio ?? null,
    lowerBound: seed.competition?.lowerBound ?? false,
    rowCount: res.rows.length,
    totalRelated: res.totalRelated,
  };
}

/** 두 스냅샷의 핵심 필드가 전부 같은가 — 똑같은 값을 반복 저장하지 않기 위해 쓴다 */
export function sameSnapshot(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return (
    a.totalSearches === b.totalSearches &&
    a.pcSearches === b.pcSearches &&
    a.mobileSearches === b.mobileSearches &&
    a.masked === b.masked &&
    a.grade === b.grade &&
    a.ratio === b.ratio &&
    a.lowerBound === b.lowerBound &&
    a.rowCount === b.rowCount &&
    a.totalRelated === b.totalRelated
  );
}

export interface HistoryDiffResult {
  previous: HistorySnapshot;
  current: HistorySnapshot;
  /** null 이면 비교 불가 (둘 중 하나라도 마스킹됐거나 이전 검색수가 0) */
  searchChangePct: number | null;
  gradeChanged: boolean;
}

/**
 * 두 스냅샷을 비교한다.
 *
 * 마스킹된(`< 10`) 조회가 하나라도 섞이면 검색수 변화율은 계산하지 않는다.
 * 마스킹된 값은 실측치가 아니라 상한이라, "9 → 15" 같은 변화가 실제로는
 * "3 → 15" 일 수도 있어 퍼센트가 의미를 갖지 못한다.
 */
export function computeHistoryDiff(
  previous: HistorySnapshot,
  current: HistorySnapshot,
): HistoryDiffResult {
  const searchChangePct =
    previous.masked || current.masked || previous.totalSearches <= 0
      ? null
      : (current.totalSearches - previous.totalSearches) / previous.totalSearches;

  return {
    previous,
    current,
    searchChangePct,
    gradeChanged: Boolean(
      previous.grade && current.grade && previous.grade !== current.grade,
    ),
  };
}

/** "3일 전" 처럼 사람이 읽는 상대 시각. 1분 미만은 "방금". */
export function relativeTimeLabel(at: number, now: number = Date.now()): string {
  const diffMs = Math.max(now - at, 0);
  const days = Math.floor(diffMs / 86_400_000);
  if (days >= 1) return `${days}일 전`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours >= 1) return `${hours}시간 전`;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes >= 1) return `${minutes}분 전`;
  return '방금';
}
