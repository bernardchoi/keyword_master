'use client';

import { useCallback, useEffect, useState } from 'react';
import KeywordTable from '@/components/KeywordTable';
import SummaryCards from '@/components/SummaryCards';
import CategoryExplorer from '@/components/CategoryExplorer';
import TagChecker from '@/components/TagChecker';
import RankChecker from '@/components/RankChecker';
import InsightPanel from '@/components/InsightPanel';
import TrendChart from '@/components/TrendChart';
import { useFavorites } from '@/hooks/useFavorites';
import { exportFavoritesCsv, exportKeywordsCsv } from '@/lib/export';
import type { AnalyzeResponse, TrendPoint } from '@/lib/types';

type Tab = 'keywords' | 'insight' | 'category' | 'tag' | 'rank' | 'favorites';

const TABS: { id: Tab; label: string }[] = [
  { id: 'keywords', label: '키워드 분석' },
  { id: 'insight', label: '구매층 · 시즌성' },
  { id: 'category', label: '카테고리별 연관' },
  { id: 'tag', label: '쇼핑 태그 검사' },
  { id: 'rank', label: '순위 조회' },
  { id: 'favorites', label: '즐겨찾기' },
];

const EXAMPLES = ['여름원피스', '캠핑의자', '홍삼스틱', '무선청소기', '강아지사료', '노트북거치대'];

export default function Home() {
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState<Tab>('keywords');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [status, setStatus] = useState<{ searchAd: boolean; openApi: boolean } | null>(null);

  const favorites = useFavorites();

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const analyze = useCallback(async (raw: string) => {
    const kw = raw.trim();
    if (!kw) {
      setError('키워드를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setTab('keywords');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, limit: 100 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '분석에 실패했습니다.');
      setData(json as AnalyzeResponse);

      fetch(`/api/trend?keyword=${encodeURIComponent(kw)}&months=12`)
        .then((r) => r.json())
        .then((j) => setTrend(j.points ?? []))
        .catch(() => setTrend([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석에 실패했습니다.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = useCallback(
    (k: string) => {
      setKeyword(k);
      void analyze(k);
    },
    [analyze],
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">
            <span className="logo-mark">K</span>
            키워드 마스터
          </div>
          <span className="spacer" />
          {status && (
            <>
              <span className={`badge ${status.searchAd ? 'ok' : 'warn'}`}>
                검색광고 API {status.searchAd ? '연결됨' : '미설정'}
              </span>
              <span className={`badge ${status.openApi ? 'ok' : 'warn'}`}>
                오픈 API {status.openApi ? '연결됨' : '미설정'}
              </span>
            </>
          )}
        </div>
      </header>

      <main className="shell">
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-pad">
            <div className="searchrow">
              <input
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyze(keyword)}
                placeholder="분석할 키워드를 입력하세요 (예: 여름원피스)"
                aria-label="키워드"
                autoFocus
              />
              <button
                type="button"
                className="btn primary"
                onClick={() => analyze(keyword)}
                disabled={loading}
              >
                {loading ? '분석 중…' : '분석하기'}
              </button>
              {data && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => exportKeywordsCsv(data.keyword, data.rows)}
                >
                  엑셀 내보내기
                </button>
              )}
            </div>
            <div className="chiprow">
              {EXAMPLES.map((k) => (
                <button type="button" className="chip" key={k} onClick={() => pick(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="notice err"><strong>오류</strong> <span>{error}</span></div>}

        {data?.notice && (
          <div className="notice">
            <span>⚠️</span>
            <span>{data.notice}</span>
          </div>
        )}

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'favorites' && favorites.count > 0 && ` (${favorites.count})`}
            </button>
          ))}
        </nav>

        {/* ─── 키워드 분석 ───────────────────────────────── */}
        {tab === 'keywords' &&
          (data ? (
            <>
              <SummaryCards data={data} />

              {trend.length > 1 && (
                <div className="card" style={{ marginBottom: 18 }}>
                  <div className="card-head">
                    <div>
                      <h2 className="card-title">최근 12개월 검색 추이</h2>
                      <p className="card-sub">{data.keyword}</p>
                    </div>
                  </div>
                  <div className="card-pad">
                    <TrendChart points={trend} />
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-head">
                  <div>
                    <h2 className="card-title">연관 키워드 {data.rows.length}개</h2>
                    {/* 잘라서 보여 준다는 사실을 감추지 않는다 — 검색광고 API 는 보통
                        수백 개를 돌려주고, 그중 검색량 상위만 표에 올라간다. */}
                    <p className="card-sub">
                      {data.totalRelated > data.rows.length
                        ? `검색광고 API 가 돌려준 ${data.totalRelated.toLocaleString('ko-KR')}개 중 검색량 상위 ${data.rows.length}개`
                        : `검색광고 API 가 돌려준 ${data.rows.length}개 전부`}
                      {' · '}
                      {data.enriched === data.rows.length
                        ? '문서수·경쟁강도까지 분석 완료'
                        : `${data.enriched}개에 문서수·경쟁강도 표시`}
                      {' · 헤더를 눌러 정렬'}
                    </p>
                  </div>
                  <span className="spacer" />
                  <span className="badge">{data.tookMs.toLocaleString('ko-KR')}ms</span>
                </div>
                <KeywordTable
                  rows={data.rows}
                  isFavorite={favorites.has}
                  onToggleFavorite={favorites.toggle}
                />
                <div className="card-pad" style={{ paddingTop: 12 }}>
                  <p className="footnote">
                    <strong>경쟁강도</strong> = 블로그 발행 문서수 ÷ 월간 검색수. 1보다 작으면 검색량 대비
                    문서가 적다는 뜻이라 상위 노출이 상대적으로 쉽습니다.
                    <br />
                    <strong>*</strong> 표시는 네이버가 검색수를 10 미만으로 마스킹한 키워드입니다. 검색수는
                    실측치가 아니라 상한(<code>&lt;</code>)이고, 그 때문에 경쟁강도도 하한(<code>≥</code>)으로
                    적습니다 — 실제 경쟁은 표시된 것보다 심할 수 있습니다.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="empty">
              <h3>키워드를 입력하고 분석을 시작하세요</h3>
              <p>월간 검색수, 경쟁강도, 연관 키워드, 쇼핑 카테고리를 한 번에 확인할 수 있습니다.</p>
            </div>
          ))}

        {/* ─── 구매층 · 시즌성 ──────────────────────────── */}
        {tab === 'insight' && <InsightPanel keyword={data?.keyword ?? null} />}

        {/* ─── 카테고리 ─────────────────────────────────── */}
        {/* 상품 검색 API 가 없으므로 카테고리는 쇼핑인사이트로 역추정한다.
            키워드당 11회 호출이라 버튼을 눌렀을 때만 돈다. */}
        {tab === 'category' && <CategoryExplorer rows={data?.rows ?? []} onPick={pick} />}

        {/* ─── 태그 검사 ────────────────────────────────── */}
        {tab === 'tag' && <TagChecker initialTags={data?.keyword ?? ''} />}

        {/* ─── 순위 조회 ────────────────────────────────── */}
        {tab === 'rank' && <RankChecker initialKeyword={data?.keyword ?? ''} />}

        {/* ─── 즐겨찾기 ─────────────────────────────────── */}
        {tab === 'favorites' && (
          <div className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">즐겨찾기 {favorites.count}개</h2>
                <p className="card-sub">이 브라우저에만 저장됩니다</p>
              </div>
              <span className="spacer" />
              {favorites.count > 0 && (
                <>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => exportFavoritesCsv(favorites.list)}
                  >
                    엑셀 내보내기
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => {
                      if (confirm('즐겨찾기를 모두 지울까요?')) favorites.clear();
                    }}
                  >
                    전체 삭제
                  </button>
                </>
              )}
            </div>
            {favorites.count === 0 ? (
              <div className="empty">
                <h3>저장한 키워드가 없습니다</h3>
                <p>키워드 표에서 ☆ 를 눌러 추가하세요.</p>
              </div>
            ) : (
              <KeywordTable
                rows={favorites.list}
                isFavorite={favorites.has}
                onToggleFavorite={favorites.toggle}
              />
            )}
          </div>
        )}
      </main>
    </>
  );
}
