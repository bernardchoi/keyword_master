'use client';

import { useMemo, useState } from 'react';
import type { KeywordRow } from '@/lib/types';
import { compact, n, pct, ratio } from '@/lib/format';

type SortKey =
  | 'rank' | 'keyword' | 'pcSearches' | 'mobileSearches' | 'totalSearches'
  | 'mobileShare' | 'blog' | 'comp' | 'adDepth';

interface Column {
  key: SortKey;
  label: string;
  align?: 'left';
  title?: string;
  /** 좁은 화면에서는 숨긴다 (총검색수·문서수·경쟁강도로도 판단 가능한 보조 지표) */
  mobileHide?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', mobileHide: true },
  { key: 'keyword', label: '키워드', align: 'left' },
  { key: 'pcSearches', label: 'PC', title: 'PC 월간 검색수', mobileHide: true },
  { key: 'mobileSearches', label: '모바일', title: '모바일 월간 검색수', mobileHide: true },
  { key: 'totalSearches', label: '총 검색수', title: 'PC + 모바일' },
  { key: 'mobileShare', label: '모바일%', title: '전체 검색 중 모바일 비중', mobileHide: true },
  { key: 'blog', label: '문서수', title: '블로그 발행 문서수 (따옴표 정확일치 기준)' },
  { key: 'comp', label: '경쟁강도', title: '블로그 문서수 ÷ 월간 검색수 (낮을수록 유리)' },
  { key: 'adDepth', label: '광고', title: '광고 경쟁정도 / 월평균 노출 광고수', mobileHide: true },
];

function cx(...parts: (string | false | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(' ') || undefined;
}

function valueOf(row: KeywordRow, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return row.keyword;
    case 'blog': return row.docs?.blog ?? -1;
    case 'comp': return row.competition?.ratio ?? Number.MAX_SAFE_INTEGER;
    default: return row[key] as number;
  }
}

interface Props {
  rows: KeywordRow[];
  isFavorite: (keyword: string) => boolean;
  onToggleFavorite: (row: KeywordRow) => void;
}

export default function KeywordTable({ rows, isFavorite, onToggleFavorite }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv), 'ko') * sort.dir;
      }
      return (av - bv) * sort.dir;
    });
    return copy;
  }, [rows, sort]);

  const click = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'rank' || key === 'keyword' || key === 'comp' ? 1 : -1 },
    );
  };

  return (
    <div className="tablewrap">
      <table className="kw">
        <thead>
          <tr>
            <th aria-label="즐겨찾기" style={{ cursor: 'default', width: 44 }} />
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={cx(c.align === 'left' && 'left', c.mobileHide && 'col-lowpri')}
                title={c.title}
                onClick={() => click(c.key)}
              >
                {c.label}
                {sort.key === c.key && <span className="sortmark">{sort.dir === 1 ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const fav = isFavorite(row.keyword);
            return (
              <tr key={row.keyword} className={row.isSeed ? 'seed' : undefined}>
                <td className="col-star">
                  <button
                    type="button"
                    className={`star${fav ? ' on' : ''}`}
                    onClick={() => onToggleFavorite(row)}
                    aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    title={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                </td>
                <td className="muted col-lowpri">{row.rank}</td>
                <td className="left">
                  <span className="kwname">{row.keyword}</span>
                  {row.masked && (
                    <span
                      className="muted"
                      title="네이버가 10 미만 검색수를 마스킹한 키워드입니다. 검색수는 실측치가 아니라 상한이라 실제 값은 더 작을 수 있습니다."
                    >
                      {' '}*
                    </span>
                  )}
                </td>
                <td className="col-lowpri">{n(row.pcSearches)}</td>
                <td className="col-lowpri">{n(row.mobileSearches)}</td>
                {/* 마스킹된 값은 상한이므로 숫자를 단정하지 않고 `<` 로 적는다 */}
                <td>
                  {row.masked && <span className="muted">&lt; </span>}
                  <strong>{n(row.totalSearches)}</strong>
                </td>
                <td className="muted col-lowpri">{pct(row.mobileShare, 0)}</td>
                <td>{row.docs ? compact(row.docs.blog) : <span className="muted">–</span>}</td>
                <td
                  title={
                    row.competition?.lowerBound
                      ? '검색수가 마스킹된 키워드라 분모가 상한값입니다. 실제 경쟁강도는 이보다 높고 등급도 더 나쁠 수 있습니다.'
                      : undefined
                  }
                >
                  {row.competition ? (
                    <>
                      <span style={{ marginRight: 6 }}>
                        {row.competition.lowerBound && <span className="muted">≥ </span>}
                        {ratio(row.competition.ratio)}
                      </span>
                      <span className={`grade ${row.competition.grade}`}>{row.competition.grade}</span>
                    </>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td className="muted col-lowpri">
                  {row.compIdx}
                  {row.adDepth > 0 && <span> · {row.adDepth}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="empty">
          <h3>표시할 키워드가 없습니다</h3>
        </div>
      )}
    </div>
  );
}
