'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KeywordRow } from '@/lib/types';

const KEY = 'km:favorites:v1';

function read(): Record<string, KeywordRow> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, KeywordRow>) : {};
  } catch {
    return {};
  }
}

export function useFavorites() {
  const [map, setMap] = useState<Record<string, KeywordRow>>({});
  const [ready, setReady] = useState(false);

  // 최초 마운트 시에만 읽는다 (SSR 하이드레이션 불일치 방지)
  useEffect(() => {
    setMap(read());
    setReady(true);
  }, []);

  // 저장은 여기서만. 상태 업데이터 안에서 부수효과를 내지 않는다.
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
      /* 저장 용량 초과 등은 조용히 무시 */
    }
  }, [map, ready]);

  const toggle = useCallback((row: KeywordRow) => {
    setMap((prev) => {
      const next = { ...prev };
      if (next[row.keyword]) delete next[row.keyword];
      else next[row.keyword] = row;
      return next;
    });
  }, []);

  const remove = useCallback((keyword: string) => {
    setMap((prev) => {
      if (!prev[keyword]) return prev;
      const next = { ...prev };
      delete next[keyword];
      return next;
    });
  }, []);

  const clear = useCallback(() => setMap({}), []);

  const has = useCallback((keyword: string) => Boolean(map[keyword]), [map]);

  const list = Object.values(map).sort((a, b) => b.totalSearches - a.totalSearches);

  return { map, list, has, toggle, remove, clear, ready, count: list.length };
}
