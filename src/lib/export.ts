import { localDateStamp } from './date';
import type { BatchRowResult } from './batch';
import type { NameAnalysis } from './product-name';
import type { TagSuggestion } from './tag-suggest';
import type { KeywordRow, TagCheckResult } from './types';

/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙여 CSV 를 만든다. */
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  return `﻿${body}`;
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const HEADERS = [
  '순위', '키워드', 'PC 검색수', '모바일 검색수', '총 검색수', '검색수 마스킹',
  '모바일 비중(%)',
  '블로그 문서수(정확일치)', '경쟁강도(문서/검색)', '경쟁강도 하한여부', '경쟁등급',
  '광고 경쟁정도', '월평균 노출광고수',
  'PC 클릭수', '모바일 클릭수', 'PC 클릭률(%)', '모바일 클릭률(%)',
];

/**
 * 조회하지 못한 값은 0 이 아니라 빈 칸으로 둔다. 0 은 "경쟁 없음"으로 오독된다.
 *
 * 숫자 칸에는 `<`·`≥` 를 섞지 않는다 — 엑셀에서 텍스트가 되어 정렬·수식이 깨진다.
 * 대신 값이 상한/하한이라는 사실을 별도 열로 뺀다.
 */
function toRow(r: KeywordRow): (string | number)[] {
  return [
    r.rank,
    r.keyword,
    r.pcSearches,
    r.mobileSearches,
    r.totalSearches,
    r.masked ? 'Y (실제 검색수는 이 값 미만)' : '',
    (r.mobileShare * 100).toFixed(1),
    r.docs?.blog ?? '',
    r.competition ? r.competition.ratio.toFixed(3) : '',
    r.competition?.lowerBound ? 'Y (실제 경쟁강도는 이 값 이상)' : '',
    r.competition?.grade ?? '',
    r.compIdx,
    r.adDepth,
    r.pcClicks,
    r.mobileClicks,
    r.pcCtr,
    r.mobileCtr,
  ];
}

export function exportKeywordsCsv(keyword: string, rows: KeywordRow[]) {
  download(`키워드마스터_${keyword}_${localDateStamp()}.csv`, toCsv(HEADERS, rows.map(toRow)));
}

export function exportFavoritesCsv(rows: KeywordRow[]) {
  download(`키워드마스터_즐겨찾기_${localDateStamp()}.csv`, toCsv(HEADERS, rows.map(toRow)));
}

/**
 * 상품명 최적화 결과.
 *
 * 요약·검사·걸리는 검색어·추천 단어·못 걸린 검색어는 모양이 서로 달라서
 * 맨 앞에 `구분` 열을 두고 한 파일에 담는다. 엑셀에서 그 열로 필터를 걸면
 * 섹션별로 볼 수 있고, 파일이 여러 개로 흩어지지 않는다.
 *
 * 숫자 칸에는 기호를 섞지 않는다 — 엑셀에서 텍스트가 되면 정렬·수식이 깨진다.
 * 화면의 `⚠` 는 `확인필요` 열로 뺐다.
 */
const PRODUCT_NAME_HEADERS = [
  '구분', '항목', '검색량', '글자당 검색량', '경쟁등급', '확인필요', '설명',
];

export function exportProductNameCsv(seed: string, name: string, a: NameAnalysis) {
  const rows: (string | number)[][] = [];
  const add = (
    section: string,
    label: string,
    volume: number | '' = '',
    perChar: number | '' = '',
    grade = '',
    check = '',
    note = '',
  ) => rows.push([section, label, volume, perChar, grade, check, note]);

  add('요약', '분석 키워드', '', '', '', '', seed);
  add('요약', '상품명', '', '', '', '', name.trim());
  add('요약', '글자수', a.length);
  add('요약', '단어수', a.tokens.length);
  add('요약', '추정 상품유형', '', '', '', '', a.head ?? '추정 실패');
  add('요약', '같은 품목 키워드 수', a.sameTypeCount);
  add('요약', '걸리는 검색어 수', a.covered.length);
  add('요약', '커버 검색량', a.coveredVolume);
  add('요약', '못 걸린 검색량', a.missedVolume);

  for (const issue of a.issues) add('검사', issue.code, '', '', '', '', issue.message);

  for (const c of a.covered) add('걸리는 검색어', c.keyword, c.totalSearches, '', c.grade ?? '');

  for (const s of a.suggestions) {
    add(
      '추천 단어',
      s.token,
      s.gain,
      s.perChar,
      '',
      s.standalone ? 'Y (단독으로도 검색되는 말 — 브랜드 여부 확인)' : '',
      `새로 걸리는 검색어: ${s.unlocks.join(', ')}`,
    );
  }

  for (const m of a.missed) add('못 걸린 검색어', m.keyword, m.totalSearches, '', m.grade ?? '');

  download(
    `키워드마스터_상품명_${seed}_${localDateStamp()}.csv`,
    toCsv(PRODUCT_NAME_HEADERS, rows),
  );
}

/**
 * 태그 추천 + 검사 결과.
 *
 * 상품명 CSV 와 같은 방식 — 맨 앞 `구분` 열로 섹션을 나눈다.
 * `선택` 열이 Y 인 행이 실제로 상품에 넣을 태그다 (슬롯 10개).
 */
const TAG_HEADERS = [
  '구분', '태그', '선택', '월간 검색수', '경쟁등급', '추천점수', '판정', '적합도', '설명',
];

export function exportTagsCsv(
  seed: string,
  productName: string,
  suggestion: TagSuggestion,
  selected: string[],
  checked: TagCheckResult[],
) {
  const rows: (string | number)[][] = [];
  const add = (
    section: string,
    tag: string,
    pick: string | '' = '',
    volume: number | '' = '',
    grade = '',
    score: number | '' = '',
    verdict = '',
    fit: number | '' = '',
    note = '',
  ) => rows.push([section, tag, pick, volume, grade, score, verdict, fit, note]);

  const picked = new Set(selected);

  add('요약', '분석 키워드', '', '', '', '', '', '', seed);
  add('요약', '상품명', '', '', '', '', '', '', productName.trim() || '(입력 안 함)');
  add('요약', '추정 상품유형', '', '', '', '', '', '', suggestion.head ?? '추정 실패');
  add('요약', '선택한 태그 수', '', selected.length);
  add('요약', '후보 수', '', suggestion.candidates.length);
  add('요약', '제외 - 상품명이 이미 커버', '', suggestion.droppedInName);
  add('요약', '제외 - 다른 품목', '', suggestion.droppedOffType);
  add('요약', '제외 - 정책 위반', '', suggestion.droppedBlocked);

  for (const c of suggestion.candidates) {
    add(
      '후보',
      c.tag,
      picked.has(c.tag) ? 'Y' : '',
      c.totalSearches,
      c.grade ?? '',
      c.score,
      '',
      '',
      c.uncertain ? '검색수가 마스킹돼 등급이 하한입니다' : '',
    );
  }

  for (const r of checked) {
    add(
      '검사 결과',
      r.normalized,
      picked.has(r.tag) ? 'Y' : '',
      r.evidence.monthlySearches ?? '',
      '',
      '',
      r.verdict,
      r.score,
      r.issues.map((i) => `[${i.level}] ${i.message}`).join(' / '),
    );
  }

  download(`키워드마스터_태그_${seed}_${localDateStamp()}.csv`, toCsv(TAG_HEADERS, rows));
}

/**
 * 다중 상품 일괄 처리 결과.
 *
 * 상품명 CSV·태그 CSV 와 달리 여기는 상품 하나가 표의 한 행이다(섹션 구분이
 * 필요 없다) — 여러 상품을 나란히 비교하려고 돌리는 기능이라 한 상품의
 * 세부 내역보다 상품 간 비교가 우선이다. 추천 단어·추천 태그는 상위
 * 5개만 한 칸에 이어 적는다.
 */
const BATCH_HEADERS = [
  '줄', '키워드', '상품명', '상태', '오류', '글자수', '추정 상품유형',
  '커버 검색량', '걸리는 검색어 수', '검사 - 불가', '검사 - 주의',
  '추천 단어(상위 5)', '추천 태그(상위 5)',
];

export function exportBatchCsv(results: BatchRowResult[]) {
  const toRow = (r: BatchRowResult): (string | number)[] => {
    if (r.status === 'error' || !r.analysis || !r.tags) {
      return [r.line, r.keyword, r.name, '실패', r.error ?? '', '', '', '', '', '', '', '', ''];
    }
    const block = r.analysis.issues.filter((i) => i.level === 'block').length;
    const warn = r.analysis.issues.filter((i) => i.level === 'warn').length;
    return [
      r.line,
      r.keyword,
      r.name,
      '성공',
      '',
      r.analysis.length,
      r.analysis.head ?? '',
      r.analysis.coveredVolume,
      r.analysis.covered.length,
      block,
      warn,
      r.analysis.suggestions.slice(0, 5).map((s) => s.token).join(', '),
      r.tags.candidates.slice(0, 5).map((c) => c.tag).join(', '),
    ];
  };

  download(`키워드마스터_일괄처리_${localDateStamp()}.csv`, toCsv(BATCH_HEADERS, results.map(toRow)));
}
