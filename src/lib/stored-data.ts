import type { KeywordRow } from './types';
import type { HistorySnapshot } from './history';

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const numbers = (v: Record<string,unknown>, keys: string[]) => keys.every(k=>typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= 0);
const grade = (v: unknown) => v === null || ['최고','좋음','보통','나쁨','최악'].includes(v as string);

export function isStoredRow(v: unknown): v is KeywordRow {
  return object(v) && typeof v.keyword === 'string' && typeof v.masked === 'boolean' && typeof v.isSeed === 'boolean' &&
    numbers(v,['rank','pcSearches','mobileSearches','totalSearches','mobileShare','pcClicks','mobileClicks','pcCtr','mobileCtr','adDepth']) &&
    typeof v.compIdx === 'string' && (v.docs === null || (object(v.docs) && numbers(v.docs,['blog']))) &&
    (v.competition === null || (object(v.competition) && numbers(v.competition,['ratio']) && grade(v.competition.grade) && typeof v.competition.lowerBound === 'boolean'));
}

export function isStoredHistory(v: unknown): v is HistorySnapshot[] {
  return Array.isArray(v) && v.every(s=>object(s) && numbers(s,['at','totalSearches','pcSearches','mobileSearches','rowCount','totalRelated']) &&
    typeof s.masked === 'boolean' && typeof s.lowerBound === 'boolean' && grade(s.grade) &&
    (s.ratio === null || numbers(s,['ratio'])));
}

export function parseStoredMap<T>(raw: string | null, valid: (value:unknown)=>value is T): Record<string,T> {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (!object(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string,T] => valid(entry[1])));
  } catch { return {}; }
}
