'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InsightResponse, TrendPoint } from '@/lib/types';
import { MONTH_LABELS } from '@/lib/seasonality';
import { compact, pct } from '@/lib/format';

function DualTrend({ search, shopping }: { search: TrendPoint[]; shopping: TrendPoint[] }) {
  const W = 720;
  const H = 150;
  const PAD = 8;

  const line = (points: TrendPoint[]) => {
    if (points.length < 2) return '';
    const max = Math.max(...points.map((p) => p.ratio), 1);
    const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
    const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(' ');
  };

  const searchPath = line(search);
  const shopPath = line(shopping);
  if (!searchPath && !shopPath) return null;

  return (
    <div>
      <div className="sparkwrap">
        <svg className="spark" style={{ height: 150 }} viewBox={`0 0 ${W} ${H}`}
             preserveAspectRatio="none" role="img" aria-label="통합검색 대비 쇼핑 검색 추이">
          {searchPath && (
            <path d={searchPath} fill="none" stroke="var(--blue)" strokeWidth="2"
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          {shopPath && (
            <path d={shopPath} fill="none" stroke="var(--accent)" strokeWidth="2"
                  strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />통합검색</span>
        <span><i style={{ background: 'var(--accent)' }} />네이버 쇼핑</span>
      </div>
      <p className="footnote" style={{ marginTop: 4 }}>
        둘 다 각자의 최댓값을 100으로 한 상대 지수라 <strong>모양(방향)만 비교</strong>하세요.
        통합검색은 느는데 쇼핑이 정체라면 구매 의도보다 정보 탐색이 늘어난 것입니다.
      </p>
    </div>
  );
}

export default function InsightPanel({ keyword }: { keyword: string | null }) {
  const [data, setData] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (kw: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insight?keyword=${encodeURIComponent(kw)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '인사이트 조회에 실패했습니다.');
      setData(json as InsightResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : '인사이트 조회에 실패했습니다.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (keyword) void load(keyword);
    else setData(null);
  }, [keyword, load]);

  if (!keyword) {
    return <div className="empty"><h3>먼저 키워드를 분석해 주세요</h3></div>;
  }
  if (loading) {
    return <div className="empty"><h3>분석 중…</h3><p>쇼핑 분야 11곳을 훑고 있습니다.</p></div>;
  }
  if (error) return <div className="notice err">{error}</div>;
  if (!data) return null;

  const s = data.seasonality;

  return (
    <>
      {data.warnings.length > 0 && (
        <div className="notice">
          <span>⚠️</span>
          <span>{data.warnings.join(' · ')}</span>
        </div>
      )}

      <div className="insightgrid">
        {/* ── 구매층 ─────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">구매층</h2>
              <p className="card-sub">
                {data.category
                  ? `${data.category.name} 분야 기준 · 최근 12개월`
                  : '카테고리를 특정하지 못했습니다'}
              </p>
            </div>
          </div>
          <div className="card-pad">
            {data.gender ? (
              <>
                <div className="splitbar">
                  <span className="f" style={{ width: `${data.gender.female * 100}%` }} />
                  <span className="m" style={{ width: `${data.gender.male * 100}%` }} />
                </div>
                <div className="legend" style={{ marginBottom: 18 }}>
                  <span><i style={{ background: '#ec4899' }} />여성 {pct(data.gender.female, 0)}</span>
                  <span><i style={{ background: '#3b82f6' }} />남성 {pct(data.gender.male, 0)}</span>
                </div>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>성별 데이터가 없습니다.</p>
            )}

            {data.ages.length > 0 ? (
              <div className="agebars">
                {data.ages.map((a) => {
                  const max = Math.max(...data.ages.map((x) => x.share), 0.01);
                  return (
                    <div className="agerow" key={a.group}>
                      <span className="agelabel">{a.group}</span>
                      <span className="agetrack">
                        <span style={{ width: `${(a.share / max) * 100}%` }} />
                      </span>
                      <span className="ageval">{pct(a.share, 0)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>연령 데이터가 없습니다.</p>
            )}
          </div>
        </div>

        {/* ── 시즌성 ─────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">시즌성</h2>
              <p className="card-sub">최근 3년 월별 검색 추이 기준</p>
            </div>
            <span className="spacer" />
            {s && <span className={`badge ${s.level === '뚜렷' ? 'warn' : ''}`}>{s.level}</span>}
          </div>
          <div className="card-pad">
            {s ? (
              <>
                <div className="monthbars">
                  {s.monthly.map((m) => (
                    <div className="monthcol" key={m.month} title={`${m.month}월 지수 ${m.index}`}>
                      <span
                        className={`mbar${s.peakMonths.includes(m.month) ? ' peak' : ''}`}
                        style={{ height: `${Math.max(m.index, 3)}%` }}
                      />
                      <span className="mlabel">{m.month}</span>
                    </div>
                  ))}
                </div>
                <div className="srow" style={{ marginTop: 14, gap: 8 }}>
                  <span className="badge ok">성수기 {s.peakMonths.map((m) => `${m}월`).join('·')}</span>
                  <span className="badge">비수기 {s.lowMonths.map((m) => `${m}월`).join('·')}</span>
                  <span className={`badge ${s.currentPhase === '성수기' ? 'ok' : ''}`}>
                    지금 {s.currentPhase}
                  </span>
                </div>
                <p className="footnote">
                  {s.level === '없음'
                    ? '계절을 거의 타지 않아 연중 꾸준한 키워드입니다.'
                    : s.monthsToPeak === 0
                      ? '지금이 성수기입니다. 신규 진입은 이미 늦었을 수 있습니다.'
                      : `다음 성수기까지 ${s.monthsToPeak}개월 남았습니다. 상품·콘텐츠 준비 시점을 여기 맞추세요.`}
                  {' '}변동계수 {s.amplitude}.
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                12개월 이상의 추이 데이터가 없어 계산할 수 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 추이 비교 ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">통합검색 vs 쇼핑 검색 추이</h2>
            <p className="card-sub">최근 12개월</p>
          </div>
        </div>
        <div className="card-pad">
          {data.shoppingTrend.length > 1 || data.searchTrend.length > 1 ? (
            <DualTrend search={data.searchTrend.slice(-12)} shopping={data.shoppingTrend} />
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>비교할 추이 데이터가 없습니다.</p>
          )}
        </div>
      </div>

      <div className="insightgrid">
        {/* ── 이슈도 ─────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">뉴스 이슈도</h2>
              <p className="card-sub">검색량 급등이 이슈성인지 실수요인지 구분</p>
            </div>
            <span className="spacer" />
            {data.news && (
              <span className={`badge ${data.news.level === '매우 뜨거움' || data.news.level === '화제' ? 'warn' : ''}`}>
                {data.news.level}
              </span>
            )}
          </div>
          <div className="card-pad">
            {data.news && data.news.perDay !== null ? (
              <>
                <div className="stat-value" style={{ fontSize: 26 }}>
                  하루 {data.news.perDay}건
                </div>
                <p className="footnote" style={{ marginTop: 6 }}>
                  최신 {data.news.sampled}건이 {data.news.spanDays}일에 걸쳐 발행됨 · 최근 기사 {data.news.latest}
                  <br />
                  전체 {compact(data.news.total)}건.
                  {data.news.level === '매우 뜨거움' || data.news.level === '화제'
                    ? ' 지금 화제인 키워드입니다. 검색량 급등이 일시적일 수 있으니 진입 전 추이를 다시 보세요.'
                    : ' 뉴스가 조용한 편이라 검색량 변화는 실수요일 가능성이 높습니다.'}
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>뉴스 데이터가 없습니다.</p>
            )}
          </div>
        </div>

        {/* ── 카테고리 후보 ──────────────────────── */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">쇼핑 분야 후보</h2>
              <p className="card-sub">클릭 데이터가 잡힌 개월 수 기준</p>
            </div>
          </div>
          <div className="card-pad">
            {data.categories.length > 0 ? (
              <>
                {data.categories.slice(0, 5).map((c) => (
                  <div className="agerow" key={c.code}>
                    <span className="agelabel" style={{ width: 96 }}>{c.name}</span>
                    <span className="agetrack">
                      <span style={{ width: `${c.coverage * 100}%` }} />
                    </span>
                    <span className="ageval">{c.periods}개월</span>
                  </div>
                ))}
                <p className="footnote">
                  쇼핑인사이트 지수는 응답 하나 안에서 정규화되어 분야끼리 크기를 비교할 수 없습니다.
                  그래서 데이터가 잡힌 개월 수로 순위를 매기고, 하나로 단정하지 않습니다.
                  여러 분야가 비슷하게 나오면 실제로 걸쳐 있는 키워드입니다.
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                쇼핑 클릭 데이터가 잡히지 않았습니다. 쇼핑성 키워드가 아닐 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
