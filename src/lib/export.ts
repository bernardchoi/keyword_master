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
  '순위', '키워드', 'PC 검색수', '모바일 검색수', '총 검색수', '모바일 비중(%)',
  '블로그 문서수(정확일치)', '쇼핑 상품수', '경쟁강도(문서/검색)', '경쟁등급',
  '쇼핑 경쟁강도', '쇼핑 등급', '광고 경쟁정도', '월평균 노출광고수',
  'PC 클릭수', '모바일 클릭수', 'PC 클릭률(%)', '모바일 클릭률(%)',
  '대표 카테고리', '카테고리 신뢰도(%)', '평균가(원)',
];

/** 조회하지 못한 값은 0 이 아니라 빈 칸으로 둔다. 0 은 "경쟁 없음"으로 오독된다. */
function toRow(r: KeywordRow): (string | number)[] {
  return [
    r.rank,
    r.keyword,
    r.pcSearches,
    r.mobileSearches,
    r.totalSearches,
    (r.mobileShare * 100).toFixed(1),
    r.docs?.blog ?? '',
    r.docs?.shop ?? '',
    r.competition ? r.competition.ratio.toFixed(3) : '',
    r.competition?.grade ?? '',
    r.competition?.shopRatio != null ? r.competition.shopRatio.toFixed(3) : '',
    r.competition?.shopGrade ?? '',
    r.compIdx,
    r.adDepth,
    r.pcClicks,
    r.mobileClicks,
    r.pcCtr,
    r.mobileCtr,
    r.category?.path ?? '',
    r.category ? Math.round(r.category.confidence * 100) : '',
    r.category?.avgPrice ?? '',
  ];
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportKeywordsCsv(keyword: string, rows: KeywordRow[]) {
  download(`키워드마스터_${keyword}_${stamp()}.csv`, toCsv(HEADERS, rows.map(toRow)));
}

export function exportFavoritesCsv(rows: KeywordRow[]) {
  download(`키워드마스터_즐겨찾기_${stamp()}.csv`, toCsv(HEADERS, rows.map(toRow)));
}
