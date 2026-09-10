'use client';

import { useEffect, useMemo, useState } from 'react';
import KeywordTable from './KeywordTable';
import { exportKeywordComparisonCsv } from '@/lib/export';
import {
  applyKeywordFilters,
  BUILT_IN_PRESETS,
  EMPTY_FILTERS,
  filtersFromSearchParams,
  writeFiltersToSearchParams,
  type FilterPreset,
  type KeywordFilters,
} from '@/lib/keyword-workspace';
import { computeOpportunityScores } from '@/lib/opportunity-score';
import { isStoredRow, parseStoredMap } from '@/lib/stored-data';
import type { KeywordRow } from '@/lib/types';
import { n, pct, ratio } from '@/lib/format';

const PRESET_KEY = 'km:filter-presets:v1';
const COMPARE_KEY = 'km:keyword-compare:v1';
const MAX_COMPARE = 5;

interface Props {
  rows: KeywordRow[];
  isFavorite: (keyword: string) => boolean;
  onToggleFavorite: (row: KeywordRow) => void;
}

function readPresets(): FilterPreset[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PRESET_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is FilterPreset => {
      if (!item || typeof item !== 'object') return false;
      const preset = item as Partial<FilterPreset>;
      const filters = preset.filters as Partial<KeywordFilters> | undefined;
      return typeof preset.id === 'string' && typeof preset.name === 'string' && Boolean(filters) &&
        typeof filters?.query === 'string' && typeof filters.minSearches === 'string' &&
        typeof filters.maxSearches === 'string' &&
        typeof filters.maxCompetition === 'string' && typeof filters.minMobileShare === 'string' &&
        typeof filters.completeDataOnly === 'boolean' && typeof filters.favoritesOnly === 'boolean';
    });
  } catch {
    return [];
  }
}

function readComparison(): Record<string, KeywordRow> {
  try {
    return parseStoredMap(window.localStorage.getItem(COMPARE_KEY), isStoredRow);
  } catch {
    return {};
  }
}

export default function KeywordWorkspace({ rows, isFavorite, onToggleFavorite }: Props) {
  const [filters, setFilters] = useState<KeywordFilters>(EMPTY_FILTERS);
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [comparison, setComparison] = useState<Record<string, KeywordRow>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)));
    setCustomPresets(readPresets());
    setComparison(readComparison());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(customPresets));
  }, [customPresets, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(comparison));
  }, [comparison, ready]);

  useEffect(() => {
    if (!ready) return;
    const params = writeFiltersToSearchParams(new URLSearchParams(window.location.search), filters);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [filters, ready]);

  const filtered = useMemo(
    () => applyKeywordFilters(rows, filters, isFavorite),
    [filters, isFavorite, rows],
  );
  const scores = useMemo(() => computeOpportunityScores(rows), [rows]);
  const comparedRows = useMemo(
    () => Object.values(comparison).sort((a, b) => b.totalSearches - a.totalSearches),
    [comparison],
  );
  const comparisonScores = useMemo(() => computeOpportunityScores(comparedRows), [comparedRows]);

  const update = <K extends keyof KeywordFilters>(key: K, value: KeywordFilters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const toggleComparison = (row: KeywordRow) => {
    setComparison((previous) => {
      const next = { ...previous };
      if (Object.hasOwn(next, row.keyword)) {
        delete next[row.keyword];
        return next;
      }
      if (Object.keys(previous).length >= MAX_COMPARE) {
        window.alert(`비교는 최대 ${MAX_COMPARE}개까지 가능합니다.`);
        return previous;
      }
      next[row.keyword] = row;
      return next;
    });
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset: FilterPreset = { id: `custom-${Date.now()}`, name: name.slice(0, 20), filters };
    setCustomPresets((previous) => [...previous, preset].slice(-12));
    setPresetName('');
  };

  const presets = [...BUILT_IN_PRESETS, ...customPresets];

  return (
    <>
      <section className="card workspace" aria-labelledby="workspace-title">
        <div className="card-head">
          <div>
            <h2 className="card-title" id="workspace-title">후보 좁히기</h2>
            <p className="card-sub">여러 조건을 함께 적용하고 현재 조합을 저장할 수 있습니다</p>
          </div>
          <span className="spacer" />
          <strong className="workspace-count">{filtered.length} / {rows.length}개</strong>
        </div>
        <div className="card-pad workspace-body">
          <div className="filter-grid">
            <label className="field">
              <span>키워드 포함</span>
              <input className="input" value={filters.query} onChange={(event) => update('query', event.target.value)} placeholder="예: 캠핑" />
            </label>
            <label className="field">
              <span>최소 검색수</span>
              <input className="input" type="number" min="0" inputMode="numeric" value={filters.minSearches} onChange={(event) => update('minSearches', event.target.value)} placeholder="제한 없음" />
            </label>
            <label className="field">
              <span>최대 검색수</span>
              <input className="input" type="number" min="0" inputMode="numeric" value={filters.maxSearches} onChange={(event) => update('maxSearches', event.target.value)} placeholder="제한 없음" />
            </label>
            <label className="field">
              <span>최대 경쟁강도</span>
              <input className="input" type="number" min="0" step="0.1" value={filters.maxCompetition} onChange={(event) => update('maxCompetition', event.target.value)} placeholder="제한 없음" />
            </label>
            <label className="field">
              <span>최소 모바일 비중 %</span>
              <input className="input" type="number" min="0" max="100" value={filters.minMobileShare} onChange={(event) => update('minMobileShare', event.target.value)} placeholder="제한 없음" />
            </label>
          </div>
          <div className="filter-options">
            <label><input type="checkbox" checked={filters.completeDataOnly} onChange={(event) => update('completeDataOnly', event.target.checked)} /> 완전한 데이터만</label>
            <label><input type="checkbox" checked={filters.favoritesOnly} onChange={(event) => update('favoritesOnly', event.target.checked)} /> 즐겨찾기만</label>
            <button type="button" className="btn sm ghost" onClick={() => setFilters(EMPTY_FILTERS)}>필터 초기화</button>
          </div>
          <div className="preset-row" aria-label="필터 프리셋">
            {presets.map((preset) => (
              <span className="preset-item" key={preset.id}>
                <button type="button" className="chip" onClick={() => setFilters(preset.filters)}>{preset.name}</button>
                {!preset.builtIn && (
                  <button type="button" className="preset-delete" aria-label={`${preset.name} 프리셋 삭제`} onClick={() => setCustomPresets((previous) => previous.filter((item) => item.id !== preset.id))}>×</button>
                )}
              </span>
            ))}
            <span className="preset-save">
              <input className="input" value={presetName} maxLength={20} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && savePreset()} placeholder="프리셋 이름" aria-label="새 프리셋 이름" />
              <button type="button" className="btn sm" disabled={!presetName.trim()} onClick={savePreset}>저장</button>
            </span>
          </div>
          <p className="footnote workspace-note">
            기회점수는 검색수 40%, 블로그 경쟁 45%, 모바일 비중 15%를 고정 구간으로 환산한 값입니다.
            자료가 없으면 0점 처리하지 않고 신뢰도를 낮춥니다. 성공 확률이나 쇼핑 경쟁 점수가 아닙니다.
          </p>
        </div>
      </section>

      {comparedRows.length > 0 && (
        <section className="card compare-card" aria-labelledby="compare-title">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="compare-title">키워드 비교 {comparedRows.length} / {MAX_COMPARE}</h2>
              <p className="card-sub">다른 검색 결과에서도 비교 담기를 이어갈 수 있습니다</p>
            </div>
            <span className="spacer" />
            {comparedRows.length >= 2 && <button type="button" className="btn sm" onClick={() => exportKeywordComparisonCsv(comparedRows, comparisonScores)}>비교 CSV</button>}
            <button type="button" className="btn sm ghost" onClick={() => setComparison({})}>비우기</button>
          </div>
          <div className="compare-chips">
            {comparedRows.map((row) => <button type="button" className="chip" key={row.keyword} onClick={() => toggleComparison(row)}>{row.keyword} ×</button>)}
          </div>
          {comparedRows.length < 2 ? (
            <div className="compare-prompt">표에서 키워드 하나를 더 담으면 비교가 시작됩니다.</div>
          ) : (
            <div className="tablewrap compare-table-wrap">
              <table className="kw compare-table">
                <thead><tr><th className="left">키워드</th><th>기회점수</th><th>신뢰도</th><th>총 검색수</th><th>모바일</th><th>블로그 문서</th><th>경쟁강도</th></tr></thead>
                <tbody>
                  {comparedRows.map((row) => {
                    const score = comparisonScores.get(row.keyword);
                    return <tr key={row.keyword}>
                      <td className="left"><strong>{row.keyword}</strong></td>
                      <td><strong>{score?.score ?? '-'}</strong></td>
                      <td>{score?.confidence ?? '-'}</td>
                      <td>{row.masked ? '< ' : ''}{n(row.totalSearches)}</td>
                      <td>{pct(row.mobileShare, 0)}</td>
                      <td>{row.docs ? n(row.docs.blog) : '자료 없음'}</td>
                      <td>{row.competition ? `${row.competition.lowerBound ? '≥ ' : ''}${ratio(row.competition.ratio)} · ${row.competition.grade}` : '자료 없음'}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="card">
        <KeywordTable
          rows={filtered}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          scores={scores}
          comparedKeywords={new Set(Object.keys(comparison))}
          onToggleCompare={toggleComparison}
        />
        <div className="card-pad" style={{ paddingTop: 12 }}>
          <p className="footnote">
            <strong>경쟁강도</strong> = 블로그 발행 문서수 ÷ 월간 검색수. 1보다 작으면 검색량 대비
            문서가 적다는 뜻이라 상위 노출이 상대적으로 쉽습니다.
            <br />
            <strong>*</strong> 표시는 네이버가 검색수를 10 미만으로 마스킹한 키워드입니다. 검색수는
            실측치가 아니라 상한(&lt;)이고, 경쟁강도도 하한(≥)입니다.
          </p>
        </div>
      </div>
    </>
  );
}
