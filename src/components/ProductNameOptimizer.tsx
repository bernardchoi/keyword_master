'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse } from '@/lib/types';
import { analyzeName, NameAnalysis, RECOMMENDED_LEN } from '@/lib/product-name';
import type { TagCheckIssue } from '@/lib/types';
import { exportProductNameCsv } from '@/lib/export';
import { compact, n } from '@/lib/format';

/** 화면에 한 번에 보여 줄 개수. CSV 에는 전부 들어간다. */
const SHOW_SUGGESTIONS = 12;
const SHOW_MISSED = 12;

const shareOf = (result: NameAnalysis | null, totalVolume: number) =>
  totalVolume > 0 ? (result?.coveredVolume ?? 0) / totalVolume : 0;

/** A/B 비교표의 "검사 결과" 칸 — 불가가 하나라도 있으면 눈에 띄게 표시한다 */
function issueSummary(issues: TagCheckIssue[]) {
  if (issues.length === 0) return <span className="muted">문제 없음</span>;
  const block = issues.filter((i) => i.level === 'block').length;
  const warn = issues.filter((i) => i.level === 'warn').length;
  if (block === 0 && warn === 0) return <span className="muted">확인 사항 있음</span>;
  return (
    <>
      {block > 0 && <span style={{ color: 'var(--g-worst)', fontWeight: 700 }}>불가 {block}</span>}
      {block > 0 && warn > 0 && ' · '}
      {warn > 0 && <span style={{ color: 'var(--g-mid)' }}>주의 {warn}</span>}
    </>
  );
}

/**
 * 계산이 전부 순수 함수라 서버를 거치지 않는다 —
 * 이미 받아 둔 연관 키워드로 타이핑하는 즉시 다시 센다. API 쿼터도 쓰지 않는다.
 */
interface Props {
  data: AnalyzeResponse | null;
  /** 상품명·브랜드는 태그 추천도 함께 쓰므로 page 에서 들고 있는다 */
  name: string;
  onNameChange: (v: string) => void;
  brands: string;
  onBrandsChange: (v: string) => void;
  /** 코드의 브랜드 목록에 없는 타사 브랜드를 사용자가 직접 보태는 목록 (localStorage 저장) */
  blockedBrandsText: string;
  onBlockedBrandsChange: (v: string) => void;
}

export default function ProductNameOptimizer({
  data,
  name,
  onNameChange,
  brands,
  onBrandsChange,
  blockedBrandsText,
  onBlockedBrandsChange,
}: Props) {
  const setName = onNameChange;
  const setBrands = onBrandsChange;

  // A/B 비교 — 태그 추천은 A(name)만 참조하므로(page.tsx 가 들고 있는 공유 상태),
  // B 는 이 화면에서만 쓰는 지역 상태로 둔다.
  const [compareOn, setCompareOn] = useState(false);
  const [compareName, setCompareName] = useState('');
  const [focus, setFocus] = useState<'A' | 'B'>('A');

  const ownBrands = useMemo(
    () => brands.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [brands],
  );
  const blockedBrands = useMemo(
    () => blockedBrandsText.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [blockedBrandsText],
  );

  const result = useMemo(
    () => (data ? analyzeName(name, data.rows, data.keyword, ownBrands, blockedBrands) : null),
    [data, name, ownBrands, blockedBrands],
  );
  const resultB = useMemo(
    () =>
      data && compareOn
        ? analyzeName(compareName, data.rows, data.keyword, ownBrands, blockedBrands)
        : null,
    [data, compareOn, compareName, ownBrands, blockedBrands],
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

  // 상세 섹션(이슈·추천 단어·걸리는 검색어)은 A/B 중 하나만 아래에 펼친다 —
  // 나란히 두 벌을 다 보여 주면 화면이 두 배로 늘어져 오히려 비교하기 어렵다.
  // 요약 비교표는 항상 둘 다 보여 주고, 상세는 토글로 고른다.
  const showingB = compareOn && focus === 'B';
  const active = showingB ? resultB : result;
  const activeName = showingB ? compareName : name;
  const activeSetName = showingB ? setCompareName : setName;

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
          <span className="spacer" />
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setCompareOn((v) => !v);
              setFocus('A');
            }}
          >
            {compareOn ? 'B안 비교 그만하기' : 'B안과 비교'}
          </button>
          {active && active.tokens.length > 0 && (
            <button
              type="button"
              className="btn sm"
              onClick={() => exportProductNameCsv(data.keyword, activeName, active)}
              title={compareOn ? `현재 보고 있는 ${showingB ? 'B' : 'A'}안을 내보냅니다` : undefined}
            >
              엑셀 내보내기{compareOn ? ` (${showingB ? 'B' : 'A'})` : ''}
            </button>
          )}
        </div>
        <div className="card-pad">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="pn-name">{compareOn ? '상품명 A (단어를 띄어 쓰세요)' : '상품명 (단어를 띄어 쓰세요)'}</label>
            <input
              id="pn-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 여성 여름 린넨 롱 원피스"
            />
          </div>
          {compareOn && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="pn-name-b">상품명 B (비교할 후보)</label>
              <input
                id="pn-name-b"
                className="input"
                value={compareName}
                onChange={(e) => setCompareName(e.target.value)}
                placeholder="예: 여성 여름 린넨 원피스 미니"
              />
            </div>
          )}
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
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="pn-blocked-brands">
              직접 확인한 타사 브랜드 추가 (선택 — 목록에 없는 브랜드를 차단)
            </label>
            <input
              id="pn-blocked-brands"
              className="input"
              value={blockedBrandsText}
              onChange={(e) => onBlockedBrandsChange(e.target.value)}
              placeholder="예: 나우, 샤크, 신일 — 브라우저에 저장되어 다음에도 남습니다"
            />
          </div>
        </div>
      </div>

      {compareOn && result && resultB && result.tokens.length > 0 && resultB.tokens.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <h2 className="card-title">A / B 비교</h2>
              <p className="card-sub">
                커버 검색량이 크고 이슈가 적은 쪽이 유리합니다 · 굵게 표시된 쪽이 더 좋은 값입니다
              </p>
            </div>
          </div>
          <div className="tablewrap">
            <table className="kw">
              <thead>
                <tr>
                  <th className="left">항목</th>
                  <th>
                    <button
                      type="button"
                      className={`btn sm ${!showingB ? 'primary' : ''}`}
                      onClick={() => setFocus('A')}
                    >
                      A 상세 보기
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className={`btn sm ${showingB ? 'primary' : ''}`}
                      onClick={() => setFocus('B')}
                    >
                      B 상세 보기
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="left">상품명</td>
                  <td className="left" style={{ fontSize: 12 }}>{name}</td>
                  <td className="left" style={{ fontSize: 12 }}>{compareName}</td>
                </tr>
                <tr>
                  <td className="left">글자수</td>
                  <td>
                    {result.length}자
                    {result.budgetLeft < 0 && (
                      <span style={{ color: 'var(--g-worst)' }}> ({RECOMMENDED_LEN}자 초과)</span>
                    )}
                  </td>
                  <td>
                    {resultB.length}자
                    {resultB.budgetLeft < 0 && (
                      <span style={{ color: 'var(--g-worst)' }}> ({RECOMMENDED_LEN}자 초과)</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="left">커버 검색량</td>
                  <td style={result.coveredVolume >= resultB.coveredVolume ? { fontWeight: 700 } : undefined}>
                    {compact(result.coveredVolume)}
                  </td>
                  <td style={resultB.coveredVolume > result.coveredVolume ? { fontWeight: 700 } : undefined}>
                    {compact(resultB.coveredVolume)}
                  </td>
                </tr>
                <tr>
                  <td className="left">걸리는 검색어</td>
                  <td style={result.covered.length >= resultB.covered.length ? { fontWeight: 700 } : undefined}>
                    {result.covered.length}개
                  </td>
                  <td style={resultB.covered.length > result.covered.length ? { fontWeight: 700 } : undefined}>
                    {resultB.covered.length}개
                  </td>
                </tr>
                <tr>
                  <td className="left">검사 결과</td>
                  <td>{issueSummary(result.issues)}</td>
                  <td>{issueSummary(resultB.issues)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {compareOn && showingB && !compareName.trim() && (
        <div className="empty">
          <h3>B안을 입력하세요</h3>
          <p>위 &ldquo;상품명 B&rdquo; 칸에 비교할 후보를 입력하면 여기 상세 분석이 나타납니다.</p>
        </div>
      )}

      {active && active.issues.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-pad">
            {active.issues.map((issue, i) => (
              <div className={`issue ${issue.level}`} key={`${issue.code}-${i}`}>
                <span className="dot" />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {active && active.tokens.length > 0 && (
        <>
          {compareOn && (
            <p className="card-sub" style={{ margin: '0 0 10px' }}>
              아래 상세는 <strong>{showingB ? 'B안' : 'A안'}</strong> 기준입니다.
            </p>
          )}
          <div className="stats">
            <div className="stat">
              <div className="stat-label">커버 검색량</div>
              <div className="stat-value">{compact(active.coveredVolume)}</div>
              <div className="stat-sub">
                연관 키워드 전체 검색량의 {(shareOf(active, totalVolume) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">걸리는 검색어</div>
              <div className="stat-value">{n(active.covered.length)}</div>
              <div className="stat-sub">{data.rows.length}개 중</div>
            </div>
            <div className="stat">
              <div className="stat-label">상품명 길이</div>
              <div className="stat-value">{active.length}자</div>
              {/* 네이버 권장 50자를 '남은 글자 예산'으로 보여 준다.
                  고정된 "권장 50자" 문구보다 지금 몇 자를 더 쓸 수 있는지가 바로 쓰인다. */}
              <div className="stat-sub">
                {active.budgetLeft >= 0 ? (
                  <>
                    {RECOMMENDED_LEN}자까지 {active.budgetLeft}자 남음
                  </>
                ) : (
                  <strong style={{ color: 'var(--g-worst)' }}>
                    권장 {RECOMMENDED_LEN}자를 {-active.budgetLeft}자 넘음
                  </strong>
                )}
                {' · '}토큰 {active.tokens.length}개
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">추정 상품유형</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {active.head ?? '–'}
              </div>
              <div className="stat-sub">
                {active.head
                  ? `연관 키워드 중 ${active.sameTypeCount}개가 같은 품목`
                  : '품목을 추정하지 못했습니다'}
              </div>
            </div>
          </div>

          {active.suggestions.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-head">
                <div>
                  <h2 className="card-title">추가할 단어</h2>
                  <p className="card-sub">
                    같은 품목({active.head}) 수식어만 후보 · 글자당 이득 순 ·
                    확인이 필요한 <span className="muted">⚠</span> 는 아래로 내립니다
                    {active.suggestions.length > SHOW_SUGGESTIONS &&
                      ` · ${active.suggestions.length}개 중 상위 ${SHOW_SUGGESTIONS}개 (전체는 엑셀로)`}
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
                    {active.suggestions.slice(0, SHOW_SUGGESTIONS).map((s) => (
                      // 예산을 넘기는 후보는 흐리게. 막지는 않는다 —
                      // 다른 단어를 빼고 넣는 선택은 사용자 몫이다.
                      <tr key={s.token} style={s.fitsBudget ? undefined : { opacity: 0.55 }}>
                        <td className="left">
                          <button
                            type="button"
                            className="chip"
                            onClick={() => activeSetName(`${activeName.trim()} ${s.token}`.trim())}
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
                          {!s.fitsBudget && (
                            <span
                              className="muted"
                              style={{ fontSize: 11 }}
                              title={`넣으면 권장 ${RECOMMENDED_LEN}자를 넘습니다. 다른 단어를 빼고 넣으세요.`}
                            >
                              {' '}· {RECOMMENDED_LEN}자 초과
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
                  <br />
                  <strong>{RECOMMENDED_LEN}자 초과 표시</strong>는 넣으면 네이버 권장 길이를 넘는
                  단어입니다. 초과는 어뷰징으로 판단될 수 있으니 다른 단어를 빼고 넣으세요. 보통은
                  그럴 일이 많지 않습니다 — 같은 품목의 쓸 만한 수식어는 {RECOMMENDED_LEN}자보다
                  훨씬 먼저 고갈되고, 그 뒤로 남는 건 대개 다른 품목이나 브랜드 단어입니다.
                </p>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">걸리는 검색어 {active.covered.length}개</h2>
                <p className="card-sub">
                  못 걸린 검색어의 합산 검색량 {compact(active.missedVolume)}
                </p>
              </div>
            </div>
            <div className="card-pad">
              {active.covered.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  아직 걸리는 검색어가 없습니다. 위 &ldquo;추가할 단어&rdquo;부터 넣어 보세요.
                </p>
              ) : (
                <div className="chiprow" style={{ marginTop: 0 }}>
                  {active.covered.map((c) => (
                    <span className="chip" style={{ cursor: 'default' }} key={c.keyword}>
                      {c.keyword}
                      <span className="muted"> {compact(c.totalSearches)}</span>
                    </span>
                  ))}
                </div>
              )}

              {active.missed.length > 0 && (
                <>
                  <p className="footnote" style={{ marginBottom: 6 }}>
                    <strong>못 걸린 검색어 상위 {Math.min(active.missed.length, SHOW_MISSED)}개</strong>
                    {active.missed.length > SHOW_MISSED && ` (전체 ${active.missed.length}개는 엑셀로)`}
                    {' '}— 같은 품목이 아닌 것도 섞여 있습니다. 내 상품과 무관하면 무시하세요.
                  </p>
                  <div className="chiprow" style={{ marginTop: 0 }}>
                    {active.missed.slice(0, SHOW_MISSED).map((c) => (
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
