'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse } from '@/lib/types';
import { analyzeName, RECOMMENDED_LEN } from '@/lib/product-name';
import { compact, n } from '@/lib/format';

/**
 * 계산이 전부 순수 함수라 서버를 거치지 않는다 —
 * 이미 받아 둔 연관 키워드로 타이핑하는 즉시 다시 센다. API 쿼터도 쓰지 않는다.
 */
export default function ProductNameOptimizer({ data }: { data: AnalyzeResponse | null }) {
  const [name, setName] = useState('');
  const [brands, setBrands] = useState('');

  const ownBrands = useMemo(
    () => brands.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [brands],
  );

  const result = useMemo(
    () => (data ? analyzeName(name, data.rows, data.keyword, ownBrands) : null),
    [data, name, ownBrands],
  );

  if (!data) {
    return (
      <div className="empty">
        <h3>먼저 키워드를 분석해 주세요</h3>
        <p>연관 키워드를 기준으로 상품명이 어떤 검색어에 걸리는지 계산합니다.</p>
      </div>
    );
  }

  const totalVolume = data.rows.reduce((s, r) => s + r.totalSearches, 0);
  const share = totalVolume > 0 ? (result?.coveredVolume ?? 0) / totalVolume : 0;

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">상품명 최적화</h2>
            <p className="card-sub">
              &ldquo;{data.keyword}&rdquo; 연관 키워드 {data.rows.length}개 기준 · 입력하는 즉시 다시 계산합니다
            </p>
          </div>
        </div>
        <div className="card-pad">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="pn-name">상품명 (단어를 띄어 쓰세요)</label>
            <input
              id="pn-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 여성 여름 린넨 롱 원피스"
            />
          </div>
          <div className="field">
            <label htmlFor="pn-brands">내가 직접 취급하는 브랜드 (선택 — 상표 오탐 방지)</label>
            <input
              id="pn-brands"
              className="input"
              value={brands}
              onChange={(e) => setBrands(e.target.value)}
              placeholder="예: 나이키, 아디다스"
            />
          </div>
        </div>
      </div>

      {result && result.issues.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-pad">
            {result.issues.map((issue, i) => (
              <div className={`issue ${issue.level}`} key={`${issue.code}-${i}`}>
                <span className="dot" />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && result.tokens.length > 0 && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">커버 검색량</div>
              <div className="stat-value">{compact(result.coveredVolume)}</div>
              <div className="stat-sub">
                연관 키워드 전체 검색량의 {(share * 100).toFixed(0)}%
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">걸리는 검색어</div>
              <div className="stat-value">{n(result.covered.length)}</div>
              <div className="stat-sub">{data.rows.length}개 중</div>
            </div>
            <div className="stat">
              <div className="stat-label">상품명 길이</div>
              <div className="stat-value">{result.length}자</div>
              <div className="stat-sub">
                권장 {RECOMMENDED_LEN}자 · 토큰 {result.tokens.length}개
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">추정 상품유형</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {result.head ?? '–'}
              </div>
              <div className="stat-sub">
                {result.head
                  ? `연관 키워드 중 ${result.sameTypeCount}개가 같은 품목`
                  : '품목을 추정하지 못했습니다'}
              </div>
            </div>
          </div>

          {result.suggestions.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-head">
                <div>
                  <h2 className="card-title">추가할 단어</h2>
                  <p className="card-sub">
                    글자당 이득이 큰 순서 · 같은 품목({result.head}) 수식어만 후보에 넣습니다
                  </p>
                </div>
              </div>
              <div className="tablewrap">
                <table className="kw">
                  <thead>
                    <tr>
                      <th className="left">단어</th>
                      <th>검색량 증가</th>
                      <th className="col-lowpri">글자당</th>
                      <th className="left">새로 걸리는 검색어</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.suggestions.map((s) => (
                      <tr key={s.token}>
                        <td className="left">
                          <button
                            type="button"
                            className="chip"
                            onClick={() => setName((prev) => `${prev.trim()} ${s.token}`.trim())}
                            title="상품명에 추가"
                          >
                            + {s.token}
                          </button>
                          {s.standalone && (
                            <span
                              className="muted"
                              title="단독으로도 검색되는 말입니다. 브랜드·고유명사라면 쓰지 마세요."
                            >
                              {' '}⚠
                            </span>
                          )}
                        </td>
                        <td><strong>+{compact(s.gain)}</strong></td>
                        <td className="muted col-lowpri">+{compact(s.perChar)}</td>
                        <td className="left muted" style={{ fontSize: 12 }}>
                          {s.unlocks.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-pad" style={{ paddingTop: 12 }}>
                <p className="footnote">
                  <strong>⚠ 표시</strong>는 단독으로도 검색되는 말입니다. 브랜드·고유명사라면 상품명에
                  넣지 마세요 — 타사 상표는 제재 대상입니다. 알려진 상표는 미리 걸러 두었지만
                  <strong> 모든 브랜드를 자동으로 판별하지는 못하므로</strong> 낯선 단어는 직접 확인하세요.
                </p>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">걸리는 검색어 {result.covered.length}개</h2>
                <p className="card-sub">
                  못 걸린 검색어의 합산 검색량 {compact(result.missedVolume)}
                </p>
              </div>
            </div>
            <div className="card-pad">
              {result.covered.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  아직 걸리는 검색어가 없습니다. 위 &ldquo;추가할 단어&rdquo;부터 넣어 보세요.
                </p>
              ) : (
                <div className="chiprow" style={{ marginTop: 0 }}>
                  {result.covered.map((c) => (
                    <span className="chip" style={{ cursor: 'default' }} key={c.keyword}>
                      {c.keyword}
                      <span className="muted"> {compact(c.totalSearches)}</span>
                    </span>
                  ))}
                </div>
              )}

              {result.missed.length > 0 && (
                <>
                  <p className="footnote" style={{ marginBottom: 6 }}>
                    <strong>못 걸린 검색어 상위</strong> — 같은 품목이 아닌 것도 섞여 있습니다.
                    내 상품과 무관하면 무시하세요.
                  </p>
                  <div className="chiprow" style={{ marginTop: 0 }}>
                    {result.missed.map((c) => (
                      <span
                        className="chip"
                        style={{ cursor: 'default', opacity: 0.6 }}
                        key={c.keyword}
                      >
                        {c.keyword}
                        <span className="muted"> {compact(c.totalSearches)}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="footnote">
                네이버쇼핑은 상품명을 단어 묶음으로 보고 검색어의 단어가 전부 들어 있으면 매칭합니다.
                이 계산은 그 동작을 근거로 한 <strong>추정</strong>이며, 네이버는 매칭 규칙을 공개하지
                않습니다. 또 랭킹은 적합도 외에 인기도(클릭·판매·리뷰)와 신뢰도로도 갈리므로,
                상품명만으로 순위가 정해지지는 않습니다.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
