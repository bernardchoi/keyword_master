'use client';

import { useState } from 'react';
import type { RankResult } from '@/lib/types';
import { won } from '@/lib/format';

export default function RankChecker({ initialKeyword = '' }: { initialKeyword?: string }) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [target, setTarget] = useState('');
  const [source, setSource] = useState<'blog' | 'cafe' | 'shop'>('blog');
  const [depth, setDepth] = useState(300);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(RankResult & { disclaimer?: string }) | null>(null);

  const run = async () => {
    if (!keyword.trim() || !target.trim()) {
      setError('키워드와 찾을 대상을 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, target, source, depth }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">순위 조회</h2>
            <p className="card-sub">특정 키워드 검색 결과에서 내 블로그·카페 글·스토어가 몇 번째인지 확인합니다</p>
          </div>
        </div>
        <div className="card-pad">
          <div className="srow" style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="rk-keyword">키워드</label>
              <input
                id="rk-keyword"
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 여름원피스"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="rk-target">찾을 대상</label>
              <input
                id="rk-target"
                className="input"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="블로그 ID, 스토어명, 도메인"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </div>
          </div>

          <div className="srow">
            <div className="field">
              <label htmlFor="rk-source">검색 영역</label>
              <select
                id="rk-source"
                className="input"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
              >
                <option value="blog">블로그</option>
                <option value="cafe">카페</option>
                <option value="shop">쇼핑</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="rk-depth">조회 범위</label>
              <select
                id="rk-depth"
                className="input"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
              >
                <option value={100}>상위 100위</option>
                <option value={300}>상위 300위</option>
                <option value={500}>상위 500위</option>
                <option value={1000}>상위 1000위</option>
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button type="button" className="btn primary" onClick={run} disabled={loading}>
                {loading ? '조회 중…' : '순위 조회'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="notice err">{error}</div>}

      {result && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">
              &ldquo;{result.keyword}&rdquo; · {result.target}
            </h2>
            <span className="spacer" />
            <span className="badge">{result.scanned.toLocaleString('ko-KR')}건 스캔</span>
          </div>
          <div className="card-pad">
            {result.hits.length === 0 ? (
              <div className="empty">
                <h3>상위 {result.scanned.toLocaleString('ko-KR')}위 안에 없습니다</h3>
                <p>조회 범위를 넓히거나 대상 표기를 바꿔 보세요 (도메인 전체 대신 아이디만 등).</p>
              </div>
            ) : (
              <ul className="ranklist">
                {result.hits.map((h) => (
                  <li className="rankitem" key={`${h.rank}-${h.link}`}>
                    <span className="rankno">{h.rank}위</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <a href={h.link} target="_blank" rel="noreferrer noopener">{h.title}</a>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {h.owner}
                        {h.postdate && ` · ${h.postdate.slice(0, 4)}.${h.postdate.slice(4, 6)}.${h.postdate.slice(6, 8)}`}
                        {h.price ? ` · ${won(h.price)}` : ''}
                      </div>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {result.disclaimer && <p className="footnote">⚠️ {result.disclaimer}</p>}
          </div>
        </div>
      )}
    </>
  );
}
