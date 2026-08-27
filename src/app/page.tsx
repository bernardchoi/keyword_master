'use client';

import { useCallback, useEffect, useState } from 'react';
import KeywordTable from '@/components/KeywordTable';
import SummaryCards from '@/components/SummaryCards';
import CategoryExplorer from '@/components/CategoryExplorer';
import ProductNameOptimizer from '@/components/ProductNameOptimizer';
import TagChecker from '@/components/TagChecker';
import RankChecker from '@/components/RankChecker';
import InsightPanel from '@/components/InsightPanel';
import TrendChart from '@/components/TrendChart';
import HistoryDiffBanner from '@/components/HistoryDiff';
import BatchOptimizer from '@/components/BatchOptimizer';
import { useFavorites } from '@/hooks/useFavorites';
import { useLocalStorageText } from '@/hooks/useLocalStorageText';
import { useAnalysisHistory } from '@/hooks/useAnalysisHistory';
import { computeHistoryDiff, snapshotFromAnalysis, type HistoryDiffResult } from '@/lib/history';
import Link from 'next/link';
import { exportFavoritesCsv, exportKeywordsCsv } from '@/lib/export';
import type { AnalyzeResponse, TrendPoint } from '@/lib/types';
import { FEATURES, SITE_DESCRIPTION } from '@/lib/site';

type Tab =
  | 'keywords'
  | 'productName'
  | 'insight'
  | 'category'
  | 'tag'
  | 'rank'
  | 'batch'
  | 'favorites';

const TABS: { id: Tab; label: string }[] = [
  { id: 'keywords', label: '키워드 분석' },
  { id: 'productName', label: '상품명 최적화' },
  { id: 'insight', label: '구매층 · 시즌성' },
  { id: 'category', label: '카테고리별 연관' },
  { id: 'tag', label: '쇼핑 태그 검사' },
  { id: 'rank', label: '순위 조회' },
  { id: 'batch', label: '일괄 처리' },
  { id: 'favorites', label: '즐겨찾기' },
];

const EXAMPLES = ['여름원피스', '캠핑의자', '홍삼스틱', '무선청소기', '강아지사료', '노트북거치대'];

export default function Home() {
  const [keyword, setKeyword] = useState('');
  // 상품명은 두 탭이 함께 쓴다 — 태그 추천은 "상품명이 이미 걸어 둔 검색어"를 빼야 해서
  // 상품명 최적화 탭의 입력을 그대로 받아야 한다.
  const [productName, setProductName] = useState('');
  const [ownBrands, setOwnBrands] = useState('');
  // 코드의 브랜드 목록(brand-data.ts)에 없는 타사 브랜드를 사용자가 직접 보태는 목록.
  // 세션이 끝나도 남아 있어야 매번 다시 입력하지 않는다 — localStorage 에 저장한다.
  const [blockedBrandsText, setBlockedBrandsText] = useLocalStorageText('km:blockedBrands:v1');
  const [tab, setTab] = useState<Tab>('keywords');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [status, setStatus] = useState<{ searchAd: boolean; openApi: boolean } | null>(null);
  // 같은 키워드를 다시 분석했을 때 "지난번 대비" 배너를 띄우기 위한 이전 스냅샷
  const [historyDiff, setHistoryDiff] = useState<HistoryDiffResult | null>(null);

  const favorites = useFavorites();
  const history = useAnalysisHistory();

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
      const result = json as AnalyzeResponse;
      setData(result);

      // 실제 데이터일 때만 이력을 남긴다 — 데모 데이터는 키워드마다 결정적이라
      // 매번 "변화 없음"으로만 나와 진짜 추적처럼 보이면 오히려 오해를 산다.
      if (!result.demo) {
        const snapshot = snapshotFromAnalysis(result);
        if (snapshot) {
          const previous = history.getPrevious(kw);
          setHistoryDiff(previous ? computeHistoryDiff(previous, snapshot) : null);
          history.record(kw, snapshot);
        } else {
          setHistoryDiff(null);
        }
      } else {
        setHistoryDiff(null);
      }

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
  }, [history]);

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
          <Link href="/guide" className="navlink">
            가이드
          </Link>
          <Link href="/audit" className="navlink">
            SEO 진단
          </Link>
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
        {/* 크롤러 눈으로 볼 때 이 페이지가 무엇인지 알려주는 유일한 h1·본문 문단.
            아래 목록 항목명은 JSON-LD의 featureList(src/lib/site.ts)와 100% 동일해야 한다. */}
        <section className="intro">
          <h1>네이버 키워드 검색량 · 경쟁강도 분석</h1>
          <p>{SITE_DESCRIPTION}</p>
          <ul className="intro-features">
            {FEATURES.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong> — {f.description}
                {'guideSlug' in f && (
                  <>
                    {' '}
                    <Link href={`/guide/${f.guideSlug}`} className="intro-guidelink">
                      계산 방식 보기 →
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

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
              {historyDiff && <HistoryDiffBanner diff={historyDiff} />}
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

        {/* ─── 상품명 최적화 ────────────────────────────── */}
        {/* 계산이 순수 함수라 서버를 거치지 않는다 — 이미 받아 둔 rows 를 그대로 쓴다. */}
        {tab === 'productName' && (
          <ProductNameOptimizer
            data={data}
            name={productName}
            onNameChange={setProductName}
            brands={ownBrands}
            onBrandsChange={setOwnBrands}
            blockedBrandsText={blockedBrandsText}
            onBlockedBrandsChange={setBlockedBrandsText}
          />
        )}

        {/* ─── 구매층 · 시즌성 ──────────────────────────── */}
        {tab === 'insight' && <InsightPanel keyword={data?.keyword ?? null} />}

        {/* ─── 카테고리 ─────────────────────────────────── */}
        {/* 상품 검색 API 가 없으므로 카테고리는 쇼핑인사이트로 역추정한다.
            키워드당 11회 호출이라 버튼을 눌렀을 때만 돈다. */}
        {tab === 'category' && <CategoryExplorer rows={data?.rows ?? []} onPick={pick} />}

        {/* ─── 태그 검사 ────────────────────────────────── */}
        {tab === 'tag' && (
          <TagChecker
            data={data}
            productName={productName}
            brands={ownBrands}
            onBrandsChange={setOwnBrands}
            blockedBrandsText={blockedBrandsText}
            onBlockedBrandsChange={setBlockedBrandsText}
          />
        )}

        {/* ─── 순위 조회 ────────────────────────────────── */}
        {tab === 'rank' && <RankChecker initialKeyword={data?.keyword ?? ''} />}

        {/* ─── 일괄 처리 ────────────────────────────────── */}
        {/* 상품마다 시드 키워드가 다를 수 있어 data 에 의존하지 않는다 — 자체적으로 /api/analyze 를 돈다. */}
        {tab === 'batch' && (
          <BatchOptimizer brands={ownBrands} blockedBrandsText={blockedBrandsText} />
        )}

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
