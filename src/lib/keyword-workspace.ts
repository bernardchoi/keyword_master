import type { KeywordRow } from './types';

export interface KeywordFilters {
  query: string;
  minSearches: string;
  maxSearches: string;
  maxCompetition: string;
  minMobileShare: string;
  completeDataOnly: boolean;
  favoritesOnly: boolean;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: KeywordFilters;
  builtIn?: boolean;
}

export const EMPTY_FILTERS: KeywordFilters = {
  query: '',
  minSearches: '',
  maxSearches: '',
  maxCompetition: '',
  minMobileShare: '',
  completeDataOnly: false,
  favoritesOnly: false,
};

export const BUILT_IN_PRESETS: FilterPreset[] = [
  { id: 'long-tail', name: '롱테일', builtIn: true, filters: { ...EMPTY_FILTERS, minSearches: '100', maxSearches: '5000', maxCompetition: '1' } },
  { id: 'mobile', name: '모바일 강세', builtIn: true, filters: { ...EMPTY_FILTERS, minSearches: '100', minMobileShare: '70' } },
  { id: 'low-competition', name: '저경쟁', builtIn: true, filters: { ...EMPTY_FILTERS, maxCompetition: '0.5', completeDataOnly: true } },
];

function optionalNumber(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function applyKeywordFilters(
  rows: KeywordRow[],
  filters: KeywordFilters,
  isFavorite: (keyword: string) => boolean,
): KeywordRow[] {
  const query = filters.query.trim().toLocaleLowerCase('ko-KR');
  const minSearches = optionalNumber(filters.minSearches);
  const maxSearches = optionalNumber(filters.maxSearches);
  const maxCompetition = optionalNumber(filters.maxCompetition);
  const minMobileShare = optionalNumber(filters.minMobileShare);

  return rows.filter((row) => {
    if (query && !row.keyword.toLocaleLowerCase('ko-KR').includes(query)) return false;
    if (minSearches !== null && row.totalSearches < minSearches) return false;
    if (maxSearches !== null && row.totalSearches > maxSearches) return false;
    if (maxCompetition !== null && (!row.competition || row.competition.ratio > maxCompetition)) return false;
    if (minMobileShare !== null && row.mobileShare * 100 < minMobileShare) return false;
    if (filters.completeDataOnly && (!row.docs || !row.competition || row.masked || row.competition.lowerBound)) return false;
    if (filters.favoritesOnly && !isFavorite(row.keyword)) return false;
    return true;
  });
}

export function filtersFromSearchParams(params: URLSearchParams): KeywordFilters {
  return {
    query: params.get('fq') ?? '',
    minSearches: params.get('fs') ?? '',
    maxSearches: params.get('fx') ?? '',
    maxCompetition: params.get('fc') ?? '',
    minMobileShare: params.get('fm') ?? '',
    completeDataOnly: params.get('fd') === '1',
    favoritesOnly: params.get('ff') === '1',
  };
}

export function writeFiltersToSearchParams(params: URLSearchParams, filters: KeywordFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const entries: [string, string][] = [
    ['fq', filters.query.trim()],
    ['fs', filters.minSearches.trim()],
    ['fx', filters.maxSearches.trim()],
    ['fc', filters.maxCompetition.trim()],
    ['fm', filters.minMobileShare.trim()],
    ['fd', filters.completeDataOnly ? '1' : ''],
    ['ff', filters.favoritesOnly ? '1' : ''],
  ];
  for (const [key, value] of entries) value ? next.set(key, value) : next.delete(key);
  return next;
}
