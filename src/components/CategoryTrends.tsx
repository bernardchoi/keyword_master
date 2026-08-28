'use client';

import { useState } from 'react';
import type { CategoryTrendsResponse } from '@/lib/types';
import TrendChart from './TrendChart';

const CALLS = 11;

export default function CategoryTrends() {
  const [data, setData] = useState<CategoryTrendsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shopping-trend');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.');
      setData(json as CategoryTrendsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-pad">
          <p className="footnote" style={{ marginTop: 0 }}>
            네이버쇼핑 11개 1depth 분야 각각의 최근 12개월 클릭 추이를 조회합니다. 특정 키워드가
            아니라 분야 전체의 흐름이라 검색창의 키워드와 무관하며, 분야마다 API를 한 번씩(총{' '}
            {CALLS}회) 호출하므로 버튼을 눌렀을 때만 조회합니다.
          </p>
          <button type="button" className="btn primary" onClick={run} disabled={loading}>
            {loading ? '조회 중…' : '분야 트렌드 조회'}
          </button>
        </div>
      </div>

      {error && <div className="notice err">{error}</div>}

      {data && (
        <>
          {data.warnings.length > 0 && (
            <div className="notice">
              <span>⚠️</span>
              <span>{data.warnings.join(' · ')}</span>
            </div>
          )}

          <div className="insightgrid">
            {data.categories.map((c) => {
              const s = c.seasonality;
              return (
                <div className="card" key={c.code}>
                  <div className="card-head">
                    <h3 className="card-title">{c.name}</h3>
                    <span className="spacer" />
                    {s && (
                      <span className={`badge ${s.currentPhase === '성수기' ? 'ok' : ''}`}>
                        지금 {s.currentPhase}
                      </span>
                    )}
                  </div>
                  <div className="card-pad">
                    {c.trend.length > 1 ? (
                      <TrendChart points={c.trend} />
                    ) : (
                      <p className="muted" style={{ fontSize: 13 }}>추이 데이터가 없습니다.</p>
                    )}
                    {s && (
                      <p className="footnote" style={{ marginTop: 8 }}>
                        {s.level === '없음'
                          ? '연중 흐름이 고른 분야입니다.'
                          : `성수기 ${s.peakMonths.map((m) => `${m}월`).join('·')} · 비수기 ${s.lowMonths.map((m) => `${m}월`).join('·')}`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="footnote">
            각 분야는 자기 자신의 최근 12개월 안에서 최댓값을 100으로 한 상대 지수입니다. 분야끼리
            크기(어느 쪽이 더 큰 시장인지)는 비교할 수 없고, 그 분야 자체의 시간 흐름(성수기·비수기,
            최근 방향)만 봐야 합니다.
          </p>
        </>
      )}
    </>
  );
}
