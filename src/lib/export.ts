import { localDateStamp } from './date';
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
