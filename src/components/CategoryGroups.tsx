'use client';

import type { AnalyzeResponse } from '@/lib/types';
import { compact } from '@/lib/format';

export default function CategoryGroups({
  data,
  onPick,
}: {
  data: AnalyzeResponse;
  onPick: (keyword: string) => void;
}) {
  if (data.groups.length === 0) {
    return (
      <div className="empty">
        <h3>카테고리 정보가 없습니다</h3>
        <p>네이버 쇼핑에 등록된 상품이 있는 키워드여야 카테고리를 추출할 수 있습니다.</p>
      </div>
    );
  }

  const max = Math.max(...data.groups.map((g) => g.totalSearches), 1);

  return (
    <>
      <p className="footnote" style={{ marginTop: 0, marginBottom: 14 }}>
        각 키워드의 네이버 쇼핑 검색 결과 상위 100개 상품이 어느 카테고리에 몰려 있는지 집계해,
        같은 카테고리끼리 연관 키워드를 묶었습니다. 상품 등록 카테고리를 정하거나 상세페이지 키워드를
        고를 때 참고하세요.
      </p>
      <div className="groupgrid">
        {data.groups.map((g) => (
          <div className="group" key={g.path}>
            <div className="group-path">{g.depth1}</div>
            <div className="group-title">{g.path.split(' > ').slice(1).join(' > ') || g.path}</div>
            <div className="bar">
              <span style={{ width: `${(g.totalSearches / max) * 100}%` }} />
            </div>
            <div className="group-meta">
              키워드 {g.keywords.length}개 · 합산 검색량 {compact(g.totalSearches)}
            </div>
            <div className="chiprow">
              {g.keywords.slice(0, 14).map((k) => (
                <button type="button" className="chip" key={k} onClick={() => onPick(k)}>
                  {k}
                </button>
              ))}
              {g.keywords.length > 14 && (
                <span className="chip" style={{ cursor: 'default' }}>
                  +{g.keywords.length - 14}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
