'use client';

import { useMemo, useState } from 'react';
import type { CategoryCandidate, KeywordRow } from '@/lib/types';
import { compact } from '@/lib/format';

const MAX_KEYWORDS = 20;
const CALLS_PER_KEYWORD = 11;

interface Result {
  keyword: string;
  categories: CategoryCandidate[];
  /** 이 키워드 결과가 캐시에서 왔는가 — 다시 눌러도 API 를 안 쓴다는 증거를 화면에 보여 준다 */
  cacheHit: boolean;
}

interface Group {
  code: string;
  name: string;
  items: { keyword: string; totalSearches: number; periods: number; cacheHit: boolean }[];
  totalSearches: number;
}

export default function CategoryExplorer({
  rows,
  onPick,
}: {
  rows: KeywordRow[];
  onPick: (keyword: string) => void;
}) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // 검색량 상위부터 분류한다 — 쿼터를 쓸 가치가 큰 순서
  const targets = useMemo(
    () => [...rows].sort((a, b) => b.totalSearches - a.totalSearches).slice(0, MAX_KEYWORDS),
    [rows],
  );

  const volumeOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.keyword, r.totalSearches);
    return map;
  }, [rows]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: targets.map((t) => t.keyword) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '분류에 실패했습니다.');
      setResults(json.results as Result[]);
      setWarnings(json.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분류에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const { groups, unclassified } = useMemo(() => {
    if (!results) return { groups: [] as Group[], unclassified: [] as string[] };

    const map = new Map<string, Group>();
    const none: string[] = [];

    for (const r of results) {
      const top = r.categories[0];
      if (!top) {
        none.push(r.keyword);
        continue;
      }
      const g = map.get(top.code) ?? {
        code: top.code,
        name: top.name,
        items: [],
        totalSearches: 0,
      };
      const vol = volumeOf.get(r.keyword) ?? 0;
      g.items.push({ keyword: r.keyword, totalSearches: vol, periods: top.periods, cacheHit: r.cacheHit });
      g.totalSearches += vol;
      map.set(top.code, g);
    }

    const groups = [...map.values()].sort((a, b) => b.totalSearches - a.totalSearches);
    for (const g of groups) g.items.sort((a, b) => b.totalSearches - a.totalSearches);
    return { groups, unclassified: none };
  }, [results, volumeOf]);

  if (rows.length === 0) {
    return <div className="empty"><h3>먼저 키워드를 분석해 주세요</h3></div>;
  }

  const maxVolume = Math.max(...groups.map((g) => g.totalSearches), 1);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">카테고리별 연관 키워드</h2>
            <p className="card-sub">
              검색량 상위 {targets.length}개 키워드를 네이버 쇼핑 분야별로 묶습니다
            </p>
          </div>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={run} disabled={loading}>
            {loading ? '분류 중…' : results ? '다시 분류' : '카테고리 분류 실행'}
          </button>
        </div>
        <div className="card-pad">
          <p className="footnote" style={{ marginTop: 0 }}>
            쇼핑인사이트 API 는 카테고리 코드를 입력으로만 받아서, 키워드 하나의 분야를 알아내려면
            11개 분야를 전부 조회해야 합니다. 이번 실행은 약{' '}
            <strong>{(targets.length * CALLS_PER_KEYWORD).toLocaleString('ko-KR')}회</strong> 호출을
            사용합니다 (쇼핑인사이트 월 한도 50,000회). 자동 실행하지 않고 버튼을 눌렀을 때만 도는
            이유입니다. 한 번 조회한 키워드는 6시간 동안 캐시돼 다시 눌러도 쿼터를 쓰지 않습니다.
          </p>
        </div>
      </div>

      {error && <div className="notice err">{error}</div>}
      {warnings.length > 0 && (
        <div className="notice">
          <span>⚠️</span>
          <span>{warnings.slice(0, 3).join(' · ')}</span>
        </div>
      )}

      {loading && (
        <div className="empty">
          <h3>분류 중…</h3>
          <p>키워드 {targets.length}개 × 분야 11곳을 훑고 있습니다. 10초 안팎 걸립니다.</p>
        </div>
      )}

      {results && !loading && (
        <>
          {results.some((r) => r.cacheHit) && (
            <div className="notice info" style={{ marginBottom: 16 }}>
              <span>⚡</span>
              <span>
                {results.filter((r) => r.cacheHit).length}/{results.length}개는 캐시된 결과입니다
                (⚡ 표시 — 다시 호출하지 않고 즉시 표시했습니다).
              </span>
            </div>
          )}
          <div className="groupgrid">
            {groups.map((g) => (
              <div className="group" key={g.code}>
                <div className="group-path">코드 {g.code}</div>
                <div className="group-title">{g.name}</div>
                <div className="bar">
                  <span style={{ width: `${(g.totalSearches / maxVolume) * 100}%` }} />
                </div>
                <div className="group-meta">
                  키워드 {g.items.length}개 · 합산 검색량 {compact(g.totalSearches)}
                </div>
                <div className="chiprow">
                  {g.items.map((it) => (
                    <button
                      type="button"
                      className="chip"
                      key={it.keyword}
                      onClick={() => onPick(it.keyword)}
                      title={
                        `검색량 ${compact(it.totalSearches)} · 데이터 ${it.periods}개월` +
                        (it.cacheHit ? ' · 캐시된 결과 (재호출 없음)' : '')
                      }
                    >
                      {it.cacheHit && <span title="캐시된 결과">⚡</span>} {it.keyword}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {unclassified.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div>
                  <h2 className="card-title">분류되지 않음 {unclassified.length}개</h2>
                  <p className="card-sub">네이버 쇼핑에서 클릭 데이터가 잡히지 않은 키워드</p>
                </div>
              </div>
              <div className="card-pad">
                <div className="chiprow" style={{ marginTop: 0 }}>
                  {unclassified.map((k) => (
                    <button type="button" className="chip" key={k} onClick={() => onPick(k)}>
                      {k}
                    </button>
                  ))}
                </div>
                <p className="footnote">
                  쇼핑성 키워드가 아니거나(정보 탐색형), 검색량이 낮아 클릭 데이터가 집계되지 않은
                  경우입니다. 상품 등록보다 콘텐츠 유입용으로 적합할 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {groups.length === 0 && unclassified.length === 0 && (
            <div className="empty"><h3>분류 결과가 없습니다</h3></div>
          )}
        </>
      )}
    </>
  );
}
