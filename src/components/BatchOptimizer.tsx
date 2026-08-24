'use client';

import { useMemo, useRef, useState } from 'react';
import { parseBatchInput } from '@/lib/csv';
import { computeBatchResults, type BatchRowResult, type KeywordData } from '@/lib/batch';
import { mapLimit } from '@/lib/metrics';
import { exportBatchCsv } from '@/lib/export';
import { compact } from '@/lib/format';
import type { AnalyzeResponse } from '@/lib/types';

/**
 * 다중 상품 일괄 처리.
 *
 * 상품명 커버리지·태그 후보 계산(`lib/batch.ts`)은 순수 함수라 서버를
 * 거치지 않지만, 상품마다 시드 키워드가 다를 수 있어 그 연관 키워드는
 * `/api/analyze` 로 받아 와야 한다. 같은 키워드를 쓰는 상품은 한 번만
 * 조회해서 나눠 쓴다.
 *
 * 한 키워드 조회가 문서수 분석까지 포함해 4~5초 걸리므로(README 참고),
 * 키워드 가짓수를 제한하지 않으면 사용자가 모르고 수십 초~분 단위로
 * 기다리게 된다. 한 번에 처리하는 상품 수와 서로 다른 키워드 수를 모두
 * 제한해 두었다.
 */

const MAX_ROWS = 30;
const MAX_UNIQUE_KEYWORDS = 15;
/** API HUB 공용 게이트(ratelimit.ts)가 이미 25 RPS 로 누르고 있으니, 여기서는
 *  키워드 사이의 동시 진행만 낮게 잡아 사용자 쪽 대기 체감을 완만하게 한다. */
const CONCURRENCY = 2;

const SAMPLE =
  '키워드,상품명,브랜드(선택)\n' +
  '린넨원피스,여성 여름 린넨 원피스 미니,\n' +
  '캠핑의자,경량 접이식 캠핑의자 좌식,';

interface Props {
  /** 공용 "내가 직접 취급하는 브랜드" — 다른 탭과 같은 입력을 그대로 쓴다 */
  brands: string;
  /** 공용 "직접 확인한 타사 브랜드 추가" — 마찬가지로 공유 */
  blockedBrandsText: string;
}

export default function BatchOptimizer({ brands, blockedBrandsText }: Props) {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [keywordData, setKeywordData] = useState<Record<string, KeywordData | { error: string }>>({});
  // null 이면 아직 실행 전. 값이 있으면 그 시점의 rows·keywordData 로 계산된 결과가 있다는 뜻.
  const [ranAt, setRanAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ownBrands = useMemo(
    () => brands.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [brands],
  );
  const blockedBrands = useMemo(
    () => blockedBrandsText.split(/[\n,]/).map((b) => b.trim()).filter(Boolean),
    [blockedBrandsText],
  );

  const parsed = useMemo(() => parseBatchInput(text), [text]);
  const overflow = parsed.rows.length > MAX_ROWS;
  const rows = overflow ? parsed.rows.slice(0, MAX_ROWS) : parsed.rows;
  const uniqueKeywords = useMemo(() => [...new Set(rows.map((r) => r.keyword))], [rows]);
  const tooManyKeywords = uniqueKeywords.length > MAX_UNIQUE_KEYWORDS;

  const results = useMemo<BatchRowResult[] | null>(() => {
    if (ranAt === null) return null;
    return computeBatchResults(rows, keywordData, ownBrands, blockedBrands);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ranAt 은 "다시 계산해야 한다"는 신호일 뿐이라 계산식에 쓰지 않는다
  }, [ranAt, rows, keywordData, ownBrands, blockedBrands]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  const run = async () => {
    if (rows.length === 0 || tooManyKeywords) return;
    setRunning(true);
    setProgress({ done: 0, total: uniqueKeywords.length });

    const map: Record<string, KeywordData | { error: string }> = {};
    let done = 0;
    await mapLimit(uniqueKeywords, CONCURRENCY, async (kw) => {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, limit: 100 }),
        });
        const json = (await res.json()) as AnalyzeResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? '분석에 실패했습니다.');
        map[kw] = { keyword: json.keyword, rows: json.rows };
      } catch (e) {
        map[kw] = { error: e instanceof Error ? e.message : '분석에 실패했습니다.' };
      } finally {
        done++;
        setProgress({ done, total: uniqueKeywords.length });
      }
    });

    setKeywordData(map);
    setRanAt(Date.now());
    setRunning(false);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">다중 상품 일괄 처리</h2>
            <p className="card-sub">
              여러 상품의 상품명 커버리지·태그 후보를 한 번에 계산합니다 · 최대 {MAX_ROWS}행,
              서로 다른 키워드 {MAX_UNIQUE_KEYWORDS}개까지
            </p>
          </div>
        </div>
        <div className="card-pad">
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="batch-text">
              키워드,상품명,브랜드(선택 · 여러 개면 세미콜론으로) — 한 줄에 상품 하나
            </label>
            <textarea
              id="batch-text"
              className="input"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE}
              style={{ fontFamily: 'monospace', fontSize: 12.5 }}
            />
          </div>
          <div className="srow" style={{ alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>
              CSV 파일 선택
            </button>
            <button type="button" className="btn sm" onClick={() => setText(SAMPLE)}>
              샘플 채우기
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={run} disabled={running || rows.length === 0 || tooManyKeywords}>
              {running ? '분석 중…' : `일괄 분석 시작 (${rows.length}개 상품)`}
            </button>
          </div>

          {parsed.errors.length > 0 && (
            <div className="notice err" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>⚠️</span>
              <span>
                {parsed.errors.length}개 줄을 건너뛰었습니다: {parsed.errors.join(' · ')}
              </span>
            </div>
          )}
          {overflow && (
            <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>⚠️</span>
              <span>
                {parsed.rows.length}개 상품 중 상위 {MAX_ROWS}개만 처리합니다. 나머지{' '}
                {parsed.rows.length - MAX_ROWS}개는 잘라 내고 다시 실행하세요.
              </span>
            </div>
          )}
          {tooManyKeywords && (
            <div className="notice err" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>⚠️</span>
              <span>
                서로 다른 키워드가 {uniqueKeywords.length}개입니다 (최대 {MAX_UNIQUE_KEYWORDS}개).
                키워드 하나당 문서수 분석까지 포함해 몇 초씩 걸려서, 한 번에 너무 많이 돌리면
                오래 기다리게 됩니다. 여러 번에 나눠 실행하세요.
              </span>
            </div>
          )}
          {!tooManyKeywords && rows.length > 0 && (
            <p className="footnote" style={{ marginTop: 12, marginBottom: 0 }}>
              서로 다른 키워드 {uniqueKeywords.length}개를 조회합니다 (같은 키워드를 쓰는 상품은
              한 번만 조회해 나눠 씁니다). 키워드당 3~5초 정도 걸립니다.
            </p>
          )}

          {progress && (
            <div style={{ marginTop: 14 }}>
              <div className="bar">
                <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
              <p className="footnote" style={{ margin: 0 }}>
                키워드 {progress.done}/{progress.total} 분석 완료
              </p>
            </div>
          )}
        </div>
      </div>

      {results && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">
                결과 {results.filter((r) => r.status === 'ok').length}/{results.length}
              </h2>
              <p className="card-sub">
                {results.some((r) => r.status === 'error') &&
                  `${results.filter((r) => r.status === 'error').length}개는 처리하지 못했습니다`}
              </p>
            </div>
            <span className="spacer" />
            <button type="button" className="btn sm" onClick={() => exportBatchCsv(results)}>
              엑셀 내보내기
            </button>
          </div>
          <div className="tablewrap">
            <table className="kw">
              <thead>
                <tr>
                  <th className="left">키워드</th>
                  <th className="left">상품명</th>
                  <th>글자수</th>
                  <th>커버 검색량</th>
                  <th>걸리는 검색어</th>
                  <th>검사</th>
                  <th className="left col-lowpri">추천 단어(상위 3)</th>
                  <th className="left col-lowpri">추천 태그(상위 3)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.line}>
                    <td className="left">{r.keyword}</td>
                    <td className="left">{r.name}</td>
                    {r.status === 'error' || !r.analysis || !r.tags ? (
                      <td colSpan={6} className="left" style={{ color: 'var(--g-worst)' }}>
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td>{r.analysis.length}자</td>
                        <td>
                          <strong>{compact(r.analysis.coveredVolume)}</strong>
                        </td>
                        <td>{r.analysis.covered.length}개</td>
                        <td>
                          {(() => {
                            const block = r.analysis.issues.filter((i) => i.level === 'block').length;
                            const warn = r.analysis.issues.filter((i) => i.level === 'warn').length;
                            if (block > 0) return <span style={{ color: 'var(--g-worst)' }}>불가 {block}</span>;
                            if (warn > 0) return <span style={{ color: 'var(--g-mid)' }}>주의 {warn}</span>;
                            return <span className="muted">없음</span>;
                          })()}
                        </td>
                        <td className="left muted col-lowpri" style={{ fontSize: 12 }}>
                          {r.analysis.suggestions.slice(0, 3).map((s) => s.token).join(', ') || '–'}
                        </td>
                        <td className="left muted col-lowpri" style={{ fontSize: 12 }}>
                          {r.tags.candidates.slice(0, 3).map((c) => c.tag).join(', ') || '–'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
