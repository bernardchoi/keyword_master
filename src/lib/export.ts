import { localDateStamp } from './date';
import type { NameAnalysis } from './product-name';
import type { KeywordRow } from './types';

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
