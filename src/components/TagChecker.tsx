'use client';

import { useState } from 'react';
import type { TagCheckResult } from '@/lib/types';
import { compact } from '@/lib/format';

const VERDICT_CLASS: Record<TagCheckResult['verdict'], string> = {
  '등록 가능': 'ok',
  '주의 필요': 'warn',
  '등록 불가': 'no',
};

export default function TagChecker({ initialTags = '' }: { initialTags?: string }) {
  const [tags, setTags] = useState(initialTags);
  const [brands, setBrands] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TagCheckResult[] | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  const run = async () => {
    const list = tags.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
    if (list.length === 0) {
      setError('검사할 태그를 한 줄에 하나씩 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tag-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: list,
          ownBrands: brands.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
        }),
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

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">쇼핑 태그 등록 가능 여부 검사</h2>
            <p className="card-sub">
              스마트스토어 상품등록 정책 + 월간 검색수 · 시즌성으로 태그 적합성을 판정합니다 (최대 20개)
            </p>
          </div>
        </div>
        <div className="card-pad">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="tags">검사할 태그 (한 줄에 하나 또는 쉼표로 구분)</label>
            <textarea
              id="tags"
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={'여름원피스\n린넨원피스\n무료배송원피스\n나이키운동화'}
            />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="brands">내가 직접 취급하는 브랜드 (선택 — 상표 오탐 방지)</label>
            <input
              id="brands"
              className="input"
              value={brands}
              onChange={(e) => setBrands(e.target.value)}
              placeholder="예: 나이키, 아디다스"
            />
          </div>
          <button type="button" className="btn primary" onClick={run} disabled={loading}>
            {loading ? '검사 중…' : '태그 검사하기'}
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
