'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse, TagCheckResult } from '@/lib/types';
import { suggestTags, TAG_SLOTS } from '@/lib/tag-suggest';
import { parseTags } from '@/lib/tag-rules';
import { exportTagsCsv } from '@/lib/export';
import { compact } from '@/lib/format';

const VERDICT_CLASS: Record<TagCheckResult['verdict'], string> = {
  '등록 가능': 'ok',
  '주의 필요': 'warn',
  '등록 불가': 'no',
};

/** 화면에 한 번에 보여 줄 후보 수. CSV 에는 전부 들어간다. */
const SHOW_CANDIDATES = 24;

interface Props {
  data: AnalyzeResponse | null;
  /** 상품명 최적화 탭에서 입력한 값 — 이미 걸어 둔 검색어를 후보에서 빼는 데 쓴다 */
  productName: string;
  brands: string;
  onBrandsChange: (v: string) => void;
}

export default function TagChecker({ data, productName, brands, onBrandsChange }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TagCheckResult[] | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  const ownBrands = useMemo(
    () => brands.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [brands],
  );

  const suggestion = useMemo(
    () => (data ? suggestTags(data.rows, data.keyword, productName, ownBrands) : null),
    [data, productName, ownBrands],
  );

  const extraTags = useMemo(() => parseTags(extra), [extra]);

  /**
   * 스마트스토어에서 복사한 태그는 `# 태그 ×# 태그 ×` 한 덩어리로 붙는다.
   * 붙여넣는 순간 한 줄에 하나로 펴 준다 — 세는 것만 맞춰 두면 화면과 값이 어긋나
   * 사용자가 몇 개인지 확인할 수 없다.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parseTags(text);
    // 원래 형태가 이미 한 줄에 하나면 굳이 손대지 않는다
    if (parsed.length < 2) return;

    e.preventDefault();
    const el = e.currentTarget;
    const before = extra.slice(0, el.selectionStart ?? extra.length);
    const after = extra.slice(el.selectionEnd ?? extra.length);
    const joined = parsed.join('\n');
    const next = [before.replace(/\s+$/, ''), joined, after.replace(/^\s+/, '')]
      .filter(Boolean)
      .join('\n');
    setExtra(next);
  };
  const finalTags = useMemo(
    () => [...new Set([...selected, ...extraTags])],
    [selected, extraTags],
  );

  const toggle = (tag: string) =>
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  // 한 번에 채워 주는 버튼은 두지 않는다. 검증된 10개처럼 읽히는데, 브랜드 판별이
  // 불완전해서 실제로 `유니클로원피스`·`로엠원피스` 같은 타사 상표가 상위에 섞인다.
  // 체크박스를 하나씩 누르게 해서 각 태그를 읽고 넘어가도록 한다.

  const run = async () => {
    if (finalTags.length === 0) {
      setError('검사할 태그를 고르거나 직접 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tag-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: finalTags, ownBrands }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '검사에 실패했습니다.');
      setResults(json.results as TagCheckResult[]);
      setDisclaimer(json.disclaimer ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '검사에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const over = finalTags.length > TAG_SLOTS;

  return (
    <>
      {/* ─── 추천 ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">태그 추천</h2>
            <p className="card-sub">
              {data
                ? `"${data.keyword}" 연관 키워드 ${data.rows.length}개에서 · 검색량 × 경쟁 가중치 순`
                : '먼저 키워드를 분석하면 후보를 뽑아 줍니다'}
            </p>
          </div>
        </div>

        {!data ? (
          <div className="empty">
            <h3>먼저 키워드를 분석해 주세요</h3>
            <p>아래에서 태그를 직접 입력해 검사만 하는 것도 가능합니다.</p>
          </div>
        ) : (
          <div className="card-pad">
            <p className="footnote" style={{ marginTop: 0 }}>
              태그는 <strong>상품당 {TAG_SLOTS}개</strong>가 전부입니다. 그래서 후보에서 이만큼을 뺐습니다 —
              상품명이 이미 걸어 둔 검색어 <strong>{suggestion?.droppedInName ?? 0}개</strong>(태그로 또 넣으면
              슬롯 낭비), 다른 품목 <strong>{suggestion?.droppedOffType ?? 0}개</strong>
              {suggestion?.head && ` (품목: ${suggestion.head})`}, 정책 위반{' '}
              <strong>{suggestion?.droppedBlocked ?? 0}개</strong>.
              {!productName.trim() && (
                <>
                  {' '}
                  <strong>상품명 최적화 탭에 상품명을 입력하면</strong> 이미 걸린 검색어를 빼고 더 정확하게
                  추천합니다.
                </>
              )}
            </p>

            {suggestion && suggestion.candidates.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                남은 후보가 없습니다. 연관 키워드가 대부분 다른 품목이거나 상품명이 이미 커버하고 있습니다.
                더 좁은 키워드로 다시 분석해 보세요.
              </p>
            ) : (
              <>
                <div className="tablewrap">
                  <table className="kw">
                    <thead>
                      <tr>
                        <th style={{ width: 44, cursor: 'default' }} aria-label="선택" />
                        <th className="left">태그</th>
                        <th>월간 검색수</th>
                        <th>경쟁강도</th>
                        <th className="col-lowpri">추천점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestion?.candidates.slice(0, SHOW_CANDIDATES).map((c) => (
                        <tr key={c.tag}>
                          <td className="col-star">
                            <input
                              type="checkbox"
                              checked={selected.includes(c.tag)}
                              onChange={() => toggle(c.tag)}
                              aria-label={`${c.tag} 선택`}
                            />
                          </td>
                          <td className="left">
                            <span className="kwname">{c.tag}</span>
                            <span className="muted"> {c.tag.length}자</span>
                          </td>
                          <td>
                            {c.uncertain && <span className="muted">&lt; </span>}
                            {compact(c.totalSearches)}
                          </td>
                          <td>
                            {c.grade ? (
                              <span className={`grade ${c.grade}`}>{c.grade}</span>
                            ) : (
                              <span className="muted">–</span>
                            )}
                          </td>
                          <td className="muted col-lowpri">{compact(c.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {suggestion && suggestion.candidates.length > SHOW_CANDIDATES && (
                  <p className="footnote">
                    {suggestion.candidates.length}개 중 상위 {SHOW_CANDIDATES}개 (전체는 엑셀로)
                  </p>
                )}
                <p className="footnote">
                  <strong>추천점수 = 월간 검색수 × 경쟁 가중치</strong>(최고 1.0 · 좋음 0.8 · 보통 0.5 ·
                  나쁨 0.25 · 최악 0.1). 검색량만 보면 이미 포화된 키워드에 10칸을 다 쓰게 됩니다.
                  <br />
                  <strong>한 개씩 읽고 고르세요.</strong> 한 번에 채워 주는 버튼은 일부러 두지 않았습니다 —
                  걸러 낸 뒤에도 내 상품과 맞지 않는 후보가 남기 때문입니다. 대상이 다르거나
                  (강아지 상품에 <code>고양이사료</code>), <strong>알려진 상표 목록에 없는 타사 브랜드</strong>
                  (<code>유니클로원피스</code>, <code>나우사료</code>)일 수 있습니다. 품목이 같다는 것과
                  내 상품이 맞다는 것은 다릅니다.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── 선택 + 직접 입력 + 검사 ─────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">
              고른 태그 {finalTags.length} / {TAG_SLOTS}
            </h2>
            <p className="card-sub">
              스마트스토어 상품등록 정책 + 월간 검색수 · 시즌성으로 판정합니다
            </p>
          </div>
          <span className="spacer" />
          {suggestion && (
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                exportTagsCsv(
                  data?.keyword ?? '',
                  productName,
                  suggestion,
                  finalTags,
                  results ?? [],
                )
              }
            >
              엑셀 내보내기
            </button>
          )}
        </div>
        <div className="card-pad">
          {over && (
            <div className="issue warn">
              <span className="dot" />
              <span>
                태그는 {TAG_SLOTS}개까지입니다. 현재 {finalTags.length}개 — {finalTags.length - TAG_SLOTS}개를
                빼세요.
              </span>
            </div>
          )}

          {selected.length > 0 && (
            <div className="chiprow" style={{ marginTop: 0, marginBottom: 12 }}>
              {selected.map((t) => (
                <button
                  type="button"
                  className="chip"
                  key={t}
                  onClick={() => toggle(t)}
                  title="빼기"
                >
                  {t} <span className="muted">×</span>
                </button>
              ))}
            </div>
          )}

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="tags">
              직접 입력 (한 줄에 하나 또는 쉼표로 구분) · 스마트스토어에서 복사한 태그를 그대로
              붙여넣어도 됩니다
            </label>
            <textarea
              id="tags"
              className="input"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onPaste={handlePaste}
              placeholder={'추천 목록에 없는 태그를 여기에 적으세요\n스마트스토어 태그를 복사해 붙여넣으면 자동으로 한 줄에 하나씩 정리됩니다'}
            />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="brands">내가 직접 취급하는 브랜드 (선택 — 상표 오탐 방지)</label>
            <input
              id="brands"
              className="input"
              value={brands}
              onChange={(e) => onBrandsChange(e.target.value)}
              placeholder="예: 나이키, 아디다스"
            />
          </div>
          <button type="button" className="btn primary" onClick={run} disabled={loading}>
            {loading ? '검사 중…' : `태그 ${finalTags.length}개 검사하기`}
          </button>
        </div>
      </div>

      {error && <div className="notice err">{error}</div>}

      {disclaimer && (
        <div className="notice info">
          <span>ℹ️</span>
          <span>{disclaimer}</span>
        </div>
      )}

      {results?.map((r) => (
        <div className="tagresult" key={r.tag}>
          <div className="tagresult-head">
            <span className={`verdict ${VERDICT_CLASS[r.verdict]}`}>{r.verdict}</span>
            <strong style={{ fontSize: 15 }}>{r.normalized}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{r.normalized.length}자</span>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>적합도 {r.score}점</span>
          </div>

          {r.issues.map((issue, i) => (
            <div className={`issue ${issue.level}`} key={`${issue.code}-${i}`}>
              <span className="dot" />
              <span>{issue.message}</span>
            </div>
          ))}

          <div className="footnote">
            {r.evidence.monthlySearches === null
              ? '월간 검색수 –'
              : `월간 검색수 ${compact(r.evidence.monthlySearches)}`}
          </div>
        </div>
      ))}

      {results && results.length === 0 && (
        <div className="empty"><h3>검사 결과가 없습니다</h3></div>
      )}
    </>
  );
}
